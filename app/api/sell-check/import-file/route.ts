// /app/api/sell-check/import-file/route.ts

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminAuth } from "@/app/api/_firebase/admin";
import {
  normalizeCategory as normalizeCategoryRule,
  normalizeCondition as normalizeConditionRule,
  normalizeListingStatus,
  normalizeSellCheckSource,
} from "@/lib/sellCheck/rules";

export const runtime = "nodejs";

type ImportRow = {
  title: string;
  price: string;
  soldPrice: string;
  category: string;
  condition: string;
  sold: boolean;
  listingStatus: string;
  source: string;
  views: string;
  likes: string;
  memo: string;
  brandName: string;
  modelName: string;
  material: string;

  /**
   * 少数判定用属性
   */
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
  return String(v ?? "").trim();
}

function numberOnly(v: unknown): string {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function scoreOnly(v: unknown): string {
  const raw = numberOnly(v);

  if (!raw) return "";

  const n = Number(raw);

  if (!Number.isFinite(n)) return "";

  return String(Math.max(0, Math.min(100, Math.round(n))));
}

function safeBoolean(v: unknown): boolean {
  const s = safeString(v).toLowerCase();

  return (
    v === true ||
    v === 1 ||
    s === "true" ||
    s === "1" ||
    s === "sold" ||
    s === "売却済み" ||
    s === "販売済み" ||
    s === "落札済み"
  );
}

function normalizeCategory(v: unknown): string {
  const s = safeString(v);

  if (["interior", "fashion", "hobby", "kids", "electronics", "other"].includes(s)) {
    return normalizeCategoryRule(s);
  }

  if (s.includes("家具") || s.includes("インテリア") || s.includes("雑貨")) return "interior";
  if (s.includes("服") || s.includes("バッグ") || s.includes("靴") || s.includes("ファッション")) return "fashion";
  if (s.includes("ホビー") || s.includes("玩具") || s.includes("フィギュア") || s.includes("コレクション")) return "hobby";
  if (s.includes("子ども") || s.includes("キッズ") || s.includes("育児")) return "kids";
  if (s.includes("家電") || s.includes("ガジェット") || s.includes("電子")) return "electronics";

  return "other";
}

function normalizeCondition(v: unknown): string {
  const s = safeString(v);

  if (["excellent", "good", "fair", "poor"].includes(s)) {
    return normalizeConditionRule(s);
  }

  if (s.includes("新品") || s.includes("未使用")) return "excellent";
  if (s.includes("目立った傷") || s.includes("良好")) return "good";
  if (s.includes("やや") || s.includes("使用感")) return "fair";
  if (s.includes("悪い") || s.includes("ジャンク") || s.includes("破損")) return "poor";

  return "good";
}

function splitKeywords(v: unknown): string[] {
  return safeString(v)
    .split(/[,\n、]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getValue(row: Record<string, any>, names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) {
      return row[name];
    }
  }

  return "";
}

function normalizeObjectRow(row: Record<string, any>): ImportRow {
  const price = numberOnly(
    getValue(row, ["商品価格", "出品価格", "price", "Price", "価格"])
  );

  const soldPrice =
    numberOnly(
      getValue(row, ["売却価格", "販売価格", "soldPrice", "SoldPrice", "売れた価格", "落札価格"])
    ) || "";

  const listingStatus = normalizeListingStatus({
    sold: getValue(row, ["売却済み", "sold", "Sold", "販売状態", "status", "listingStatus"]),
    listingStatus: getValue(row, ["listingStatus", "状態区分"]),
  });

  return {
    title: safeString(getValue(row, ["商品名", "タイトル", "title", "Title", "name"])),
    price,
    soldPrice: soldPrice || price,
    category: normalizeCategory(getValue(row, ["カテゴリ", "category", "Category"])),
    condition: normalizeCondition(getValue(row, ["状態", "condition", "Condition"])),
    sold: listingStatus === "sold",
    listingStatus,
    source: normalizeSellCheckSource(getValue(row, ["source", "データ元", "取得元"])),
    views: numberOnly(getValue(row, ["閲覧数", "views", "Views"])),
    likes: numberOnly(getValue(row, ["いいね", "likes", "Likes"])),
    memo: safeString(getValue(row, ["メモ", "memo", "Memo", "説明文"])),

    brandName: safeString(getValue(row, ["ブランド", "brandName", "Brand"])),
    modelName: safeString(getValue(row, ["型番", "モデル", "modelName", "Model"])),
    material: safeString(getValue(row, ["素材", "material", "Material"])),

    /**
     * 少数データ判定強化用
     */
    productType: safeString(
      getValue(row, ["商品種別", "productType"])
    ),

    characterName: safeString(
      getValue(row, ["キャラクター名", "作品名", "characterName"])
    ),

    seriesName: safeString(
      getValue(row, ["シリーズ", "seriesName"])
    ),

    maker: safeString(
      getValue(row, ["メーカー", "maker"])
    ),

    era: safeString(
      getValue(row, ["年代", "era"])
    ),

    collectorGenre: safeString(
      getValue(row, ["コレクター分類", "collectorGenre"])
    ),

    materialType: safeString(
      getValue(row, ["素材分類", "materialType"])
    ),

    extractedKeywords: splitKeywords(
      getValue(row, ["キーワード", "keywords", "extractedKeywords"])
    ),

    conditionRiskScore: scoreOnly(getValue(row, ["状態リスク", "conditionRiskScore"])),
    descriptionQualityScore: scoreOnly(getValue(row, ["説明文品質", "descriptionQualityScore"])),

    rarityScore: scoreOnly(getValue(row, ["希少性", "rarityScore"])),
    demandScore: scoreOnly(getValue(row, ["需要", "demandScore"])),
    brandPowerScore: scoreOnly(getValue(row, ["ブランド力", "brandPowerScore"])),
    collectorScore: scoreOnly(getValue(row, ["コレクター価値", "collectorScore"])),
    ageValueScore: scoreOnly(getValue(row, ["年代価値", "ageValueScore"])),
    trendScore: scoreOnly(getValue(row, ["現在人気度", "trendScore"])),
    marketSupplyScore: scoreOnly(getValue(row, ["出品数の少なさ", "marketSupplyScore"])),
    keywordStrength: scoreOnly(getValue(row, ["検索KW強度", "keywordStrength"])),
    rareReasons: splitKeywords(getValue(row, ["希少理由", "rareReasons"])),

    brightnessScore: scoreOnly(getValue(row, ["明るさ", "brightnessScore"])),
    compositionScore: scoreOnly(getValue(row, ["構図", "compositionScore"])),
    backgroundScore: scoreOnly(getValue(row, ["背景", "backgroundScore"])),
    damageRiskScore: scoreOnly(getValue(row, ["傷リスク", "damageRiskScore"])),
    overallImageScore: scoreOnly(getValue(row, ["画像総合", "overallImageScore"])),
  };
}

function parseCsvLike(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const first = lines[0];
  const delimiter = first.includes("\t") ? "\t" : ",";

  const headerCandidates = first.split(delimiter).map((x) => x.trim());
  const hasHeader =
    headerCandidates.includes("商品名") ||
    headerCandidates.includes("title") ||
    headerCandidates.includes("出品価格");

  if (hasHeader) {
    return lines.slice(1).map((line) => {
      const cols = line.split(delimiter).map((x) => x.trim());
      const obj: Record<string, any> = {};

      headerCandidates.forEach((h, i) => {
        obj[h] = cols[i] ?? "";
      });

      return normalizeObjectRow(obj);
    });
  }

  return lines.map((line) => {
    const cols = line.split(delimiter).map((x) => x.trim());

    return normalizeObjectRow({
      商品名: cols[0] || "",
      出品価格: cols[1] || "",
      売却価格: cols[2] || "",
      カテゴリ: cols[3] || "other",
      状態: cols[4] || "good",
      売却済み: cols[5] || "",
      閲覧数: cols[6] || "",
      いいね: cols[7] || "",
      メモ: cols[8] || "",
      ブランド: cols[9] || "",
      型番: cols[10] || "",
      素材: cols[11] || "",
      キーワード: cols[12] || "",
      状態リスク: cols[13] || "",
      説明文品質: cols[14] || "",

      /**
       * 少数データ判定用
       */
      商品種別: cols[15] || "",
      キャラクター名: cols[16] || "",
      シリーズ: cols[17] || "",
      メーカー: cols[18] || "",
      年代: cols[19] || "",
      コレクター分類: cols[20] || "",
      素材分類: cols[21] || "",

      source: cols[22] || "import",
      listingStatus: cols[23] || "",
    });
  });
}

function isAdminUid(uid: string | null): boolean {
  const raw = process.env.ADMIN_UIDS || process.env.NEXT_PUBLIC_ADMIN_UIDS || "";

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

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "ログイン確認が必要です" },
        { status: 401 }
      );
    }

    if (!isAdminUid(uid)) {
      return NextResponse.json(
        { ok: false, error: "管理者のみ実行できます" },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "読み込むファイルを選択してください" },
        { status: 400 }
      );
    }

    const fileName = file.name || "";
    const lower = fileName.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: ImportRow[] = [];

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        return NextResponse.json(
          { ok: false, error: "Excel内にシートがありません" },
          { status: 400 }
        );
      }

      const sheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      });

      rows = jsonRows.map(normalizeObjectRow);
    } else {
      const text = buffer.toString("utf8");
      rows = parseCsvLike(text);
    }

    const filtered = rows.filter((row) => row.title || row.price || row.soldPrice);

    return NextResponse.json({
      ok: true,
      rows: filtered.slice(0, 300),
      fileName,
      count: filtered.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { ok: false, error: "ファイル読込に失敗しました" },
      { status: 500 }
    );
  }
}