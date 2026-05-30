// app/api/generate-captions/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth, getAdminDb } from "@/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Authorization ヘッダーから Bearer トークンを取り出します。
 * 例:
 * Authorization: Bearer xxxxx
 */
function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Firebase Admin でトークンを検証し、
 * ログイン中ユーザーの uid を取り出します。
 */
async function requireUid(req: Request): Promise<string> {
  const token = bearerToken(req);

  if (!token) {
    throw new Error("missing token");
  }

  const decoded = await getAdminAuth().verifyIdToken(token);

  if (!decoded?.uid) {
    throw new Error("invalid token");
  }

  return decoded.uid;
}

/**
 * Firestore からブランド設定を読み込みます。
 * users/{uid}/brands/{brandId}
 */
async function loadBrand(uid: string, brandId: string) {
  const db = getAdminDb();
  const ref = db.doc(`users/${uid}/brands/${brandId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as any;
}

/**
 * キーワード配列を安全に 1 行文字列へまとめます。
 * 長すぎるとプロンプトが読みにくくなるため最大12個に制限します。
 */
function compactKeywords(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map(String).slice(0, 12).join(" / ");
}

/**
 * 配列を安全に string[] に変換します。
 */
function toStringArray(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * 文字列を安全に取り出します。
 */
function toSafeString(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * 文字列が空なら fallback を返します。
 */
function fallbackString(value: unknown, fallback = ""): string {
  const s = String(value ?? "").trim();
  return s || fallback;
}

/**
 * OpenAI から返ってきた JSON を安全に読むための補助関数です。
 * 期待通りでない場合でも API 全体が壊れにくいようにします。
 */
function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    /**
     * 1) ログインユーザー確認
     */
    const uid = await requireUid(req);

    /**
     * 2) リクエスト本文を取得
     */
    const body = await req.json();

    /**
     * 3) 既存入力
     *
     * 重要:
     * - 既存の brandId / vision / keywords はそのまま維持
     * - 既存フロントが壊れないようにしています
     */
    const brandId = typeof body.brandId === "string" ? body.brandId : "vento";
    const vision = typeof body.vision === "string" ? body.vision : "";
    const keywords = compactKeywords(body.keywords);

    /**
     * 4) 今回追加した EC向け入力
     *
     * ここは未入力でも動くようにしてあります。
     * 将来フロント側で商品名や特徴を渡した時に、より売れる文章へ寄せやすくなります。
     */
    const productName = toSafeString(body.productName);
    const productCategory = toSafeString(body.productCategory);
    const productPrice = toSafeString(body.productPrice);
    const productTarget = toSafeString(body.productTarget);
    const productProblem = toSafeString(body.productProblem);
    const productBenefit = toSafeString(body.productBenefit);
    const productFeatures = toStringArray(body.productFeatures, 8);
    const productMaterials = toStringArray(body.productMaterials, 8);
    const productUseScenes = toStringArray(body.productUseScenes, 8);
    const productCautions = toStringArray(body.productCautions, 8);
    const salesGoal = toSafeString(body.salesGoal);

    /**
     * vision はこの API の核なので、空ならエラー
     */
    if (!vision.trim()) {
      return NextResponse.json(
        { error: "vision is required" },
        { status: 400 }
      );
    }

    /**
     * 5) ブランド設定読み込み
     */
    const brand = await loadBrand(uid, brandId);

    if (!brand) {
      return NextResponse.json(
        { error: "brand not found. /flow/brands で作成・保存してください" },
        { status: 400 }
      );
    }

    /**
     * 6) ブランド内の captionPolicy を安全に読む
     */
    const captionPolicy = brand.captionPolicy ?? {};
    const voiceText = String(captionPolicy.voiceText ?? "");
    const igGoal = String(captionPolicy.igGoal ?? "");
    const xGoal = String(captionPolicy.xGoal ?? "");
    const must = Array.isArray(captionPolicy.must) ? captionPolicy.must.map(String) : [];
    const ban = Array.isArray(captionPolicy.ban) ? captionPolicy.ban.map(String) : [];
    const toneDefault = String(captionPolicy.toneDefault ?? "");

    /**
     * 7) OpenAI API キー確認
     */
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const client = new OpenAI({ apiKey });

    /**
     * 8) システムプロンプト
     *
     * 今回の重要追加:
     * - 既存の「誠実で広告臭を消す」は維持
     * - さらに「売れる構造」を裏で使うよう指示
     *
     * 使わせる考え方
     * - WHY（なぜその商品か）
     * - Job（誰の何を助けるか）
     * - Benefit（使うとどう変わるか）
     * - Loss Avoidance（使わないと何が不便か）
     *
     * ただし露骨な理論用語は本文に出さないようにしています。
     */
    const sys = [
      "あなたはSNS投稿文とEC販売文を作る日本語ライターです。",
      "広告臭を消し、誠実で読みやすく、売上につながる文章にしてください。",
      "ただし煽りすぎ、誇大表現、断定的な言い切りは禁止です。",
      "文章設計では次の考え方を裏で使ってください。",
      "- 商品の存在理由（WHY）",
      "- 誰のどんな困りごとを助けるか（Job）",
      "- 使うことで得られる変化（Benefit）",
      "- 使わない場合の不便や損失回避（Loss Avoidance）",
      "ただし本文内で理論名は出さないでください。",
      "Instagram は共感と世界観、X は短く鋭く、EC は購入判断しやすさを重視してください。",
      "出力は必ずJSONスキーマに一致させてください。",
    ].join("\n");

    /**
     * 9) ユーザープロンプト
     *
     * 既存のブランド設定はそのまま維持しつつ、
     * EC用情報を追加しています。
     */
    const userPrompt = [
      "【ブランド設定】",
      `name: ${String(brand.name ?? brandId)}`,
      `voiceText: ${voiceText}`,
      `igGoal: ${igGoal}`,
      `xGoal: ${xGoal}`,
      `must: ${must.join(" / ")}`,
      `ban: ${ban.join(" / ")}`,
      `toneDefault: ${toneDefault}`,
      "",
      "【今回入力】",
      `vision: ${vision}`,
      `keywords: ${keywords}`,
      `productName: ${productName}`,
      `productCategory: ${productCategory}`,
      `productPrice: ${productPrice}`,
      `productTarget: ${productTarget}`,
      `productProblem: ${productProblem}`,
      `productBenefit: ${productBenefit}`,
      `productFeatures: ${productFeatures.join(" / ")}`,
      `productMaterials: ${productMaterials.join(" / ")}`,
      `productUseScenes: ${productUseScenes.join(" / ")}`,
      `productCautions: ${productCautions.join(" / ")}`,
      `salesGoal: ${salesGoal}`,
      "",
      "【出力ルール】",
      "- instagram は投稿できる本文。長すぎず、共感→魅力→自然な締めの流れにする",
      "- x は短く、広告臭なし、読み飛ばされにくい書き方にする",
      "- ig3 は Instagram用の別案3つ。本文を上書きする用途ではない",
      "- instagramSales は Instagramで販売寄りに使う本文。共感 + 利点 + 軽い購入導線",
      "- xSales は Xで販売寄りに使う短文。短くても価値が伝わるようにする",
      "- ecTitle は EC商品名候補。短く、わかりやすく、誇大表現なし",
      "- ecDescription は EC商品説明文。誰向けか、何が良いか、どう役立つかを自然に含める",
      "- ecBullets は EC用の箇条書き3つ。特徴・利点・使いどころを簡潔に書く",
      "- どの文章も不自然な誇張、うるさいセールス、過剰な感嘆符は避ける",
      "- must があれば自然に反映し、ban は絶対に避ける",
    ].join("\n");

    /**
     * 10) OpenAI Responses API 呼び出し
     *
     * 既存構造は維持しつつ、EC用の出力項目を追加しています。
     */
    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "caption_payload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              instagram: { type: "string" },
              x: { type: "string" },
              ig3: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },

              /**
               * 今回追加
               * SNSの販売寄り文章
               */
              instagramSales: { type: "string" },
              xSales: { type: "string" },

              /**
               * 今回追加
               * EC用の文章
               */
              ecTitle: { type: "string" },
              ecDescription: { type: "string" },
              ecBullets: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: [
              "instagram",
              "x",
              "ig3",
              "instagramSales",
              "xSales",
              "ecTitle",
              "ecDescription",
              "ecBullets",
            ],
          },
        },
      },
    });

    /**
     * 11) 念のため安全に JSON を読む
     */
    const raw = resp.output_text || "{}";
    const out = parseJsonSafely(raw);

    /**
     * 12) 既存返却 + 追加返却
     *
     * 重要:
     * - instagram / x / ig3 は今まで通り返す
     * - 追加で販売寄り文章とEC文章を返す
     * - 既存フロントが古いままでも壊れにくい
     */
    return NextResponse.json({
      /**
       * 既存
       */
      instagram: fallbackString(out.instagram, ""),
      x: fallbackString(out.x, ""),
      ig3: Array.isArray(out.ig3)
        ? out.ig3.map(String).slice(0, 3)
        : ["", "", ""],

      /**
       * 今回追加
       * SNS販売寄り
       */
      instagramSales: fallbackString(out.instagramSales, ""),
      xSales: fallbackString(out.xSales, ""),

      /**
       * 今回追加
       * EC向け
       */
      ecTitle: fallbackString(out.ecTitle, ""),
      ecDescription: fallbackString(out.ecDescription, ""),
      ecBullets: Array.isArray(out.ecBullets)
        ? out.ecBullets.map(String).slice(0, 3)
        : ["", "", ""],
    });
  } catch (e: any) {
    console.error(e);

    return NextResponse.json(
      { error: e?.message || "error" },
      { status: 500 }
    );
  }
}