// app/api/sell-check/extract-market-bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ExtractMarketBulkRow = {
  title: string;
  price: string;
  soldPrice: string;
  category: string;
  condition: string;
  sold: boolean;
  views: string;
  likes: string;
  memo: string;

  brandName: string;
  modelName: string;
  material: string;

  productType: string;
  characterName: string;
  seriesName: string;
  maker: string;
  era: string;
  collectorGenre: string;
  materialType: string;

  extractedKeywords: string[];

  conditionRiskScore: string;
  descriptionQualityScore: string;

  rarityScore: string;
  demandScore: string;
  brandPowerScore: string;
  collectorScore: string;
  ageValueScore: string;
  trendScore: string;
  marketSupplyScore: string;
  keywordStrength: string;
  rareReasons: string[];

  brightnessScore: string;
  compositionScore: string;
  backgroundScore: string;
  damageRiskScore: string;
  overallImageScore: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumberString(v: unknown): string {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function safeScoreString(v: unknown): string {
  const raw = safeNumberString(v);

  if (!raw) return "";

  const n = Number(raw);

  if (!Number.isFinite(n)) return "";

  return String(Math.max(0, Math.min(100, Math.round(n))));
}

function safeBoolean(v: unknown): boolean {
  return v === true || v === "true" || v === "sold" || v === "売却済み";
}

function safeStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof v === "string") {
    return v
      .split(/[,\n、]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  return [];
}

function normalizeCategory(v: unknown): string {
  const s = safeString(v);

  if (s === "interior") return "interior";
  if (s === "fashion") return "fashion";
  if (s === "hobby") return "hobby";
  if (s === "kids") return "kids";
  if (s === "electronics") return "electronics";
  if (s === "other") return "other";

  return "other";
}

function normalizeCondition(v: unknown): string {
  const s = safeString(v);

  if (s === "excellent") return "excellent";
  if (s === "good") return "good";
  if (s === "fair") return "fair";
  if (s === "poor") return "poor";

  return "good";
}

function normalizeRow(v: any): ExtractMarketBulkRow {
  const price = safeNumberString(v?.price);
  const soldPrice = safeNumberString(v?.soldPrice) || price;

  return {
    title: safeString(v?.title),
    price,
    soldPrice,
    category: normalizeCategory(v?.category),
    condition: normalizeCondition(v?.condition),
    sold: safeBoolean(v?.sold),
    views: safeNumberString(v?.views),
    likes: safeNumberString(v?.likes),
    memo: safeString(v?.memo),

    brandName: safeString(v?.brandName),
    modelName: safeString(v?.modelName),
    material: safeString(v?.material),

    productType: safeString(v?.productType),
    characterName: safeString(v?.characterName),
    seriesName: safeString(v?.seriesName),
    maker: safeString(v?.maker),
    era: safeString(v?.era),
    collectorGenre: safeString(v?.collectorGenre),
    materialType: safeString(v?.materialType),

    extractedKeywords: safeStringArray(v?.extractedKeywords),

    conditionRiskScore: safeScoreString(v?.conditionRiskScore),
    descriptionQualityScore: safeScoreString(v?.descriptionQualityScore),

    rarityScore: safeScoreString(v?.rarityScore),
    demandScore: safeScoreString(v?.demandScore),
    brandPowerScore: safeScoreString(v?.brandPowerScore),
    collectorScore: safeScoreString(v?.collectorScore),
    ageValueScore: safeScoreString(v?.ageValueScore),
    trendScore: safeScoreString(v?.trendScore),
    marketSupplyScore: safeScoreString(v?.marketSupplyScore),
    keywordStrength: safeScoreString(v?.keywordStrength),
    rareReasons: safeStringArray(v?.rareReasons),

    brightnessScore: safeScoreString(v?.brightnessScore),
    compositionScore: safeScoreString(v?.compositionScore),
    backgroundScore: safeScoreString(v?.backgroundScore),
    damageRiskScore: safeScoreString(v?.damageRiskScore),
    overallImageScore: safeScoreString(v?.overallImageScore),
  };
}

function extractJsonText(text: string): string {
  const s = safeString(text);

  if (!s) return "";

  const fenced = s.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");

  if (first >= 0 && last > first) {
    return s.slice(first, last + 1).trim();
  }

  return s;
}

function isAdminUid(uid: string | null): boolean {
  const raw =
    process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!uid) return false;
  return ids.includes(uid);
}

async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid || null;
  } catch {
    return null;
  }
}

async function fileToImagePart(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mime = file.type || "image/png";

  return {
    type: "image_url" as const,
    image_url: {
      url: `data:${mime};base64,${base64}`,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 },
      );
    }

    if (!isAdminUid(uid)) {
      return NextResponse.json(
        { ok: false, error: "管理者のみ実行できます" },
        { status: 403 },
      );
    }

    let form: FormData;

    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            "画像容量が大きすぎます。市場スクショは自動圧縮されますが、10MBを超える場合は枚数を減らしてください。",
        },
        { status: 413 },
      );
    }

    const text = safeString(form.get("text"));

    const files = [...form.getAll("images"), ...form.getAll("image")].filter(
      (x): x is File => x instanceof File,
    );

    if (!text && files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "補足テキストまたは市場スクリーンショットを1つ以上入力してください",
        },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません" },
        { status: 500 },
      );
    }

    const imageParts = [];

    for (const file of files.slice(0, 20)) {
      imageParts.push(await fileToImagePart(file));
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `
あなたは中古販売・フリマ市場の「市場スクリーンショット一括学習」専用エンジンです。
目的は、メルカリ・Yahooフリマ・ヤフオク・ラクマ等の検索結果一覧、売却済み一覧、落札履歴一覧のスクリーンショットから、画像内に表示されている複数の商品カードを検出し、1商品=1行のLearning DB投入用データへ変換することです。

必ずJSONだけを返してください。
説明文は不要です。

返す形式：
{
  "rows": [
    {
      "title": "商品名。画像内で読める商品名を優先。読めない場合は特徴から短く仮名を作る",
      "price": "出品価格または表示価格の数字だけ。なければ空文字",
      "soldPrice": "売却価格・落札価格の数字だけ。なければpriceと同じ",
      "category": "interior | fashion | hobby | kids | electronics | other",
      "condition": "excellent | good | fair | poor",
      "sold": true,
      "views": "閲覧数の数字だけ。画像内になければ空文字",
      "likes": "いいね数の数字だけ。画像内になければ空文字",
      "memo": "どのスクショ由来か、読めた根拠、不明点、重複疑い、状態注意点を短く書く",

      "brandName": "ブランド名。なければ空文字",
      "modelName": "型番・モデル名。なければ空文字",
      "material": "素材。なければ空文字",

      "productType": "商品種別。例：ミニチュアハウス、置物、バッグ、フィギュア、本など。なければ空文字",
      "characterName": "作品名・キャラクター名。なければ空文字",
      "seriesName": "シリーズ名。なければ空文字",
      "maker": "メーカー名。なければ空文字",
      "era": "年代。例：昭和、平成初期、1980年代、現行など。なければ空文字",
      "collectorGenre": "コレクター分類。例：英国ヴィンテージ、昭和レトロ、特撮、サンリオなど。なければ空文字",
      "materialType": "素材分類。例：陶器、木製、真鍮、プラスチック、紙など。なければ空文字",

      "extractedKeywords": ["検索・類似判定に使えるキーワード"],

      "conditionRiskScore": "状態リスク 0〜100。高いほどリスク大",
      "descriptionQualityScore": "一覧スクショから読める情報量 0〜100。高いほど十分",

      "rarityScore": "希少性を0〜100で数字だけ",
      "demandScore": "需要を0〜100で数字だけ",
      "brandPowerScore": "ブランド力・IP力を0〜100で数字だけ",
      "collectorScore": "コレクター価値を0〜100で数字だけ",
      "ageValueScore": "年代価値・ヴィンテージ価値を0〜100で数字だけ",
      "trendScore": "現在人気度を0〜100で数字だけ",
      "marketSupplyScore": "出品数の少なさ・市場供給の少なさを0〜100で数字だけ",
      "keywordStrength": "検索キーワード強度を0〜100で数字だけ",
      "rareReasons": ["希少性・需要・年代価値・コレクター価値の判断理由"],

      "brightnessScore": "一覧スクショ内の商品画像の明るさ 0〜100",
      "compositionScore": "一覧スクショ内の商品画像の構図 0〜100",
      "backgroundScore": "一覧スクショ内の商品画像の背景の良さ 0〜100",
      "damageRiskScore": "画像上の傷・汚れ・破損リスク 0〜100。高いほどリスク大",
      "overallImageScore": "商品画像としての総合点 0〜100"
    }
  ]
}

最重要ルール：
- このモードでは「複数画像=同一商品の別角度」ではありません。
- 画像内に並んでいる商品カードを検出し、商品カードごとに別rowを作成してください。
- スクショ1枚に商品カードが10個ある場合は、原則10 rows返してください。
- スクショ20枚を渡された場合、全スクショから読める商品カードを可能な限り抽出してください。
- 同じ商品が複数スクショに重複している可能性がある場合も、勝手に削除せず、memoに「重複疑い」と書いてください。
- 商品名・価格・売却状態が読める商品カードを優先してください。
- 広告、カテゴリ導線、検索バー、通知、メニュー、ユーザーアイコン、関係ないUIは商品として抽出しないでください。
- 価格が読めない商品は、titleや特徴が明確な場合のみrow化し、priceは空文字にしてください。
- soldは、売却済み、SOLD、落札済み、終了、取引完了などの表示があればtrueにしてください。販売中に見える場合はfalseにしてください。
- 一覧スクショだけでは状態が分からない場合、conditionはgood、各スコアは50前後の控えめ評価にしてください。
- 分からないことは断定しないでください。
- 実際に売れる保証はしないでください。

カテゴリ判断：
- バッグ、服、靴、アクセサリー → fashion
- 家具、雑貨、インテリア小物、置物、食器 → interior
- フィギュア、カード、玩具、模型、コレクション、本、CD、DVD → hobby
- 子ども服、育児用品 → kids
- 家電、ガジェット、電子機器 → electronics
- 判断できない → other

状態判断：
- 新品、未使用、新品同様 → excellent
- 目立った傷汚れなし、良好 → good
- やや傷汚れあり、使用感あり → fair
- 全体的に状態が悪い、ジャンク、破損あり → poor

市場価値の理論推定：
- これは市場実測ではなく、一覧スクショに含まれる特徴からの推定です。
- 昭和、平成初期、70年代、80年代、90年代、当時物、初期、旧ロゴ、廃盤、絶版、限定、非売品、ヴィンテージ、レトロ、デッドストック、箱付き、タグ付き、動作確認済み、ソフビ、ブリキ、セルロイド、ホーロー、真鍮、無垢材、円谷、東映、任天堂、サンリオ、ポピー、ブルマァク、タカラ、トミー、バンダイなどは価値推定に反映してください。
- コレクター価値は、ファンが収集対象にしやすいジャンル・IP・メーカー・年代・状態・付属品の有無で判断してください。
- 年代価値は、古いだけで高くせず、当時物・廃盤・素材・保存状態・ジャンル需要が揃うほど高くしてください。
- 需要は、キャラクターIP、ブランド認知、検索されやすい語、用途の明確さ、現代でも欲しい人がいるかで判断してください。
- 現在人気度は、実測データがない場合は断定せず、ジャンルの一般的な人気・SNS映え・検索語の強さから控えめに推定してください。
- 出品数の少なさは、限定・廃盤・当時物・型番明記・古い素材・現存しにくい状態から推定してください。
- 分からない場合は50前後にしてください。

補足テキスト：
${text}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは市場スクリーンショット内の複数商品カードを検出し、1商品=1rowの有効なJSONだけを返す補助エンジンです。",
        },
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageParts],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const jsonText = extractJsonText(content);

    let parsed: any = {};

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "市場スクショ一括解析結果のJSON解析に失敗しました",
        },
        { status: 500 },
      );
    }

    const rows = Array.isArray(parsed.rows)
      ? parsed.rows.map(normalizeRow).filter((row: ExtractMarketBulkRow) => {
          return Boolean(row.title || row.price || row.soldPrice);
        })
      : [];

    return NextResponse.json({
      ok: true,
      rows,
      analyzedImageCount: imageParts.length,
      mode: "market-bulk",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "市場スクショ一括解析に失敗しました" },
      { status: 500 },
    );
  }
}
