//app/api/sell-check/import-file/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminAuth } from "@/app/api/_firebase/admin";

export const runtime = "nodejs";

type ImportRow = {
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
  extractedKeywords: string[];
  conditionRiskScore: string;
  descriptionQualityScore: string;
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
  const n = Number(numberOnly(v));
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
    s === "販売済み"
  );
}

function normalizeCategory(v: unknown): string {
  const s = safeString(v);

  if (s === "interior") return "interior";
  if (s === "fashion") return "fashion";
  if (s === "hobby") return "hobby";
  if (s === "kids") return "kids";
  if (s === "electronics") return "electronics";
  if (s === "other") return "other";

  if (s.includes("家具") || s.includes("インテリア") || s.includes("雑貨")) {
    return "interior";
  }

  if (
    s.includes("服") ||
    s.includes("バッグ") ||
    s.includes("靴") ||
    s.includes("ファッション")
  ) {
    return "fashion";
  }

  if (
    s.includes("ホビー") ||
    s.includes("玩具") ||
    s.includes("フィギュア") ||
    s.includes("コレクション")
  ) {
    return "hobby";
  }

  if (s.includes("子ども") || s.includes("キッズ") || s.includes("育児")) {
    return "kids";
  }

  if (s.includes("家電") || s.includes("ガジェット") || s.includes("電子")) {
    return "electronics";
  }

  return "other";
}

function normalizeCondition(v: unknown): string {
  const s = safeString(v);

  if (s === "excellent") return "excellent";
  if (s === "good") return "good";
  if (s === "fair") return "fair";
  if (s === "poor") return "poor";

  if (s.includes("新品") || s.includes("未使用")) return "excellent";
  if (s.includes("目立った傷") || s.includes("良好")) return "good";
  if (s.includes("やや") || s.includes("使用感")) return "fair";
  if (s.includes("悪い") || s.includes("ジャンク") || s.includes("破損")) {
    return "poor";
  }

  return "good";
}

function splitKeywords(v: unknown): string[] {
  return safeString(v)
    .split(/[,\n、]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
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
      getValue(row, ["売却価格", "販売価格", "soldPrice", "SoldPrice", "売れた価格"])
    ) || price;

  return {
    title: safeString(getValue(row, ["商品名", "タイトル", "title", "Title", "name"])),
    price,
    soldPrice,
    category: normalizeCategory(
      getValue(row, ["カテゴリ", "category", "Category"])
    ),
    condition: normalizeCondition(getValue(row, ["状態", "condition", "Condition"])),
    sold: safeBoolean(getValue(row, ["売却済み", "sold", "Sold", "販売状態"])),
    views: numberOnly(getValue(row, ["閲覧数", "views", "Views"])),
    likes: numberOnly(getValue(row, ["いいね", "likes", "Likes"])),
    memo: safeString(getValue(row, ["メモ", "memo", "Memo"])),

    brandName: safeString(getValue(row, ["ブランド", "brandName", "Brand"])),
    modelName: safeString(getValue(row, ["型番", "モデル", "modelName", "Model"])),
    material: safeString(getValue(row, ["素材", "material", "Material"])),
    extractedKeywords: splitKeywords(
      getValue(row, ["キーワード", "keywords", "extractedKeywords"])
    ),

    conditionRiskScore: scoreOnly(
      getValue(row, ["状態リスク", "conditionRiskScore"])
    ),
    descriptionQualityScore: scoreOnly(
      getValue(row, ["説明文品質", "descriptionQualityScore"])
    ),

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
      売却価格: cols[2] || cols[1] || "",
      カテゴリ: cols[3] || "other",
      状態: cols[4] || "good",
      売却済み: cols[5] || "売却済み",
      閲覧数: cols[6] || "",
      いいね: cols[7] || "",
      メモ: cols[8] || "",
      ブランド: cols[9] || "",
      型番: cols[10] || "",
      素材: cols[11] || "",
      キーワード: cols[12] || "",
      状態リスク: cols[13] || "",
      説明文品質: cols[14] || "",
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