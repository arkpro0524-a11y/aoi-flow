// app/api/sell-check/extract-deep-bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ExtractDeepBulkRow = {
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
    return v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 16);
  }
  if (typeof v === "string") {
    return v.split(/[,\n、]+/g).map((x) => x.trim()).filter(Boolean).slice(0, 16);
  }
  return [];
}

function normalizeCategory(v: unknown): string {
  const s = safeString(v);
  if (["interior", "fashion", "hobby", "kids", "electronics", "other"].includes(s)) return s;
  return "other";
}

function normalizeCondition(v: unknown): string {
  const s = safeString(v);
  if (["excellent", "good", "fair", "poor"].includes(s)) return s;
  return "good";
}

function normalizeRow(v: any): ExtractDeepBulkRow {
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
  if (first >= 0 && last > first) return s.slice(first, last + 1).trim();
  return s;
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS || "";
  const ids = raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (!uid) return false;
  return ids.includes(uid);
}

async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
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
  const mime = file.type || "image/jpeg";
  return { type: "image_url" as const, image_url: { url: `data:${mime};base64,${base64}` } };
}

function chunkFiles(files: File[], groupSize: number): File[][] {
  const size = Math.max(1, Math.min(5, Math.round(groupSize)));
  const chunks: File[][] = [];
  for (let i = 0; i < files.length; i += size) chunks.push(files.slice(i, i + size));
  return chunks;
}


function parseProductGroups(value: FormDataEntryValue | null): number[] {
  const text = safeString(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "number") return item;
        if (item && typeof item === "object") return Number((item as any).imageCount);
        return Number(item);
      })
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.max(1, Math.min(10, Math.round(n))))
      .slice(0, 60);
  } catch {
    return [];
  }
}

function chunkFilesByCounts(files: File[], counts: number[]): File[][] {
  if (counts.length === 0) return [];

  const groups: File[][] = [];
  let cursor = 0;

  counts.forEach((count) => {
    const group = files.slice(cursor, cursor + count);
    cursor += count;
    if (group.length > 0) groups.push(group);
  });

  if (cursor < files.length) groups.push(files.slice(cursor));
  return groups;
}

function parseProductTexts(value: FormDataEntryValue | null): string[] {
  const text = safeString(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => safeString(item)).slice(0, 60);
  } catch {
    return [];
  }
}

function buildPrompt(args: { text: string; productText: string; groupIndex: number; groupCount: number; fileNames: string[] }) {
  return `
あなたはAOI FLOW / SELL CHECKの「深掘り一括学習」専用エンジンです。
目的は、市場一覧の浅い抽出ではありません。
1商品につき複数スクリーンショットを読み取り、SELL CHECK / Theory DBで使える深い学習データを1商品=1行で作ることです。

このリクエストでは、添付画像はすべて同一商品の情報です。
商品画像、商品名、価格、説明文、状態、売却状態、いいね、閲覧数、コメント、類似商品、検索結果などが混ざっていても、同じ1商品として統合してください。

必ずJSONだけを返してください。説明文は不要です。
返す形式：
{
  "rows": [
    {
      "title": "商品名。読める正式名を優先。足りなければ特徴を含めて短く補完",
      "price": "出品価格または表示価格の数字だけ。なければ空文字",
      "soldPrice": "売却価格・落札価格の数字だけ。なければpriceと同じ",
      "category": "interior | fashion | hobby | kids | electronics | other",
      "condition": "excellent | good | fair | poor",
      "sold": true,
      "views": "閲覧数の数字だけ。画像内になければ空文字",
      "likes": "いいね数の数字だけ。画像内になければ空文字",
      "memo": "SELL CHECK用の判断根拠。価格根拠、状態、傷、付属品、不足情報、注意点、見送り理由候補まで具体的に書く",
      "brandName": "ブランド名。なければ空文字",
      "modelName": "型番・モデル名。なければ空文字",
      "material": "素材。なければ空文字",
      "productType": "商品種別。例：ダウンジャケット、ミニチュアハウス、置物、バッグ、フィギュア、本など",
      "characterName": "作品名・キャラクター名。なければ空文字",
      "seriesName": "シリーズ名。なければ空文字",
      "maker": "メーカー名。なければ空文字",
      "era": "年代。例：昭和、平成初期、1980年代、現行など。なければ空文字",
      "collectorGenre": "コレクター分類。例：英国ヴィンテージ、昭和レトロ、ブランド古着、特撮、サンリオなど。なければ空文字",
      "materialType": "素材分類。例：陶器、木製、真鍮、ウール、ナイロン、ポリエステルなど。なければ空文字",
      "extractedKeywords": ["検索・類似判定・市場比較に使えるキーワード"],
      "conditionRiskScore": "状態リスク 0〜100。高いほどリスク大",
      "descriptionQualityScore": "説明文・スクショ情報の充実度 0〜100。高いほど十分",
      "rarityScore": "希少性を0〜100で数字だけ",
      "demandScore": "需要を0〜100で数字だけ",
      "brandPowerScore": "ブランド力・IP力を0〜100で数字だけ",
      "collectorScore": "コレクター価値を0〜100で数字だけ",
      "ageValueScore": "年代価値・ヴィンテージ価値を0〜100で数字だけ",
      "trendScore": "現在人気度を0〜100で数字だけ",
      "marketSupplyScore": "出品数の少なさ・市場供給の少なさを0〜100で数字だけ",
      "keywordStrength": "検索キーワード強度を0〜100で数字だけ",
      "rareReasons": ["希少性・需要・年代価値・コレクター価値の判断理由"],
      "brightnessScore": "画像全体の明るさ 0〜100",
      "compositionScore": "商品が分かりやすい構図 0〜100",
      "backgroundScore": "背景の良さ 0〜100",
      "damageRiskScore": "画像上の傷・汚れ・破損・欠品リスク 0〜100。高いほどリスク大",
      "overallImageScore": "商品画像としての総合点 0〜100"
    }
  ]
}

最重要ルール：
- このモードは「複数商品を浅く市場学習」ではありません。
- この画像グループは1商品です。必ず原則1 rowで返してください。
- 画像の1枚目だけで判断せず、全画像を統合してください。
- 商品画像だけでなく、説明文、価格、状態、売却表示、いいね、閲覧数、類似売却済み、コメント欄が写っていれば必ず反映してください。
- 画像間で情報が矛盾する場合はmemoに矛盾を書き、conditionRiskScoreを上げてください。
- 傷、汚れ、使用感、欠品、サイズ不明、ブランド不明、真贋不明、型番不明、相場不明はリスクとして扱ってください。
- 類似売却済みが写っている場合は、需要・希少性・価格妥当性の判断に反映してください。
- 分からないことは断定しないでください。実際に売れる保証はしないでください。

カテゴリ判断：バッグ、服、靴、アクセサリー→fashion。家具、雑貨、インテリア小物、置物、食器→interior。フィギュア、カード、玩具、模型、コレクション、本、CD、DVD→hobby。子ども服、育児用品→kids。家電、ガジェット、電子機器→electronics。不明→other。
状態判断：新品、未使用、新品同様→excellent。目立った傷汚れなし、良好→good。やや傷汚れあり、使用感あり→fair。ジャンク、破損あり→poor。

市場価値の理論推定：
- ブランド古着は、ブランド認知、型番、素材、季節性、サイズ、状態、現行人気、定価推定、着用需要を重視してください。
- コレクター品は、メーカー、年代、素材、保存状態、付属品、箱、タグ、シリーズ名を重視してください。
- 昭和、平成初期、当時物、旧ロゴ、廃盤、絶版、限定、非売品、ヴィンテージ、レトロ、箱付き、タグ付き、旧タグ、人気ブランド、人気型番、コラボ、定番需要は価値推定に反映してください。
- 分からない場合は50前後にしてください。

現在の画像グループ：${args.groupIndex + 1} / ${args.groupCount}
画像ファイル名：${args.fileNames.join(", ")}
全体補足テキスト：
${args.text}

この商品グループ専用の補足テキスト：
${args.productText}
`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) return NextResponse.json({ ok: false, error: "ログイン確認が必要です" }, { status: 401 });
    if (!isAdminUid(uid)) return NextResponse.json({ ok: false, error: "管理者のみ実行できます" }, { status: 403 });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "画像容量が大きすぎます。10MB上限を超えています。枚数を減らすか、スクショを圧縮してから再実行してください。" }, { status: 413 });
    }

    const text = safeString(form.get("text"));
    const productTexts = parseProductTexts(form.get("productTexts"));
    const productGroups = parseProductGroups(form.get("productGroups"));
    const groupSizeRaw = Number(safeNumberString(form.get("groupSize")) || "3");
    const groupSize = Math.max(1, Math.min(5, groupSizeRaw || 3));
    const files = [...form.getAll("images"), ...form.getAll("image")].filter((x): x is File => x instanceof File);

    if (!text && files.length === 0) {
      return NextResponse.json({ ok: false, error: "補足テキストまたはSELL CHECK用スクリーンショットを1つ以上入力してください" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY が設定されていません" }, { status: 500 });
    }

    const targetFiles = files;
    const groups = targetFiles.length > 0
      ? (productGroups.length > 0 ? chunkFilesByCounts(targetFiles, productGroups) : chunkFiles(targetFiles, groupSize))
      : [[]];
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const rows: ExtractDeepBulkRow[] = [];

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      const imageParts = [];
      for (const file of group) imageParts.push(await fileToImagePart(file));

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "あなたはSELL CHECK用の深掘り学習データを、1商品=1rowの有効なJSONだけで返す補助エンジンです。" },
          { role: "user", content: [{ type: "text", text: buildPrompt({ text, productText: productTexts[i] ?? "", groupIndex: i, groupCount: groups.length, fileNames: group.map((file) => file.name || "uploaded-image") }) }, ...imageParts] },
        ],
      });

      const content = completion.choices[0]?.message?.content || "";
      const jsonText = extractJsonText(content);
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return NextResponse.json({ ok: false, error: `SELL CHECK深掘り解析結果のJSON解析に失敗しました。画像グループ${i + 1}を減らして再実行してください。` }, { status: 500 });
      }

      const normalized = Array.isArray(parsed.rows)
        ? parsed.rows.map(normalizeRow).filter((row: ExtractDeepBulkRow) => Boolean(row.title || row.price || row.soldPrice || row.memo))
        : [];

      if (normalized[0]) {
        rows.push({ ...normalized[0], memo: [`深掘りグループ${i + 1}/${groups.length}`, normalized[0].memo].filter(Boolean).join(" / ") });
      }
    }

    return NextResponse.json({ ok: true, rows, analyzedImageCount: targetFiles.length, groupSize, mode: "deep-bulk" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "SELL CHECK深掘り一括解析に失敗しました" }, { status: 500 });
  }
}
