// /lib/server/idempotency.ts
import crypto from "crypto";

/**
 * 深い安定 stringify（順序ゆれを完全に潰す）
 * - Object の key はソート
 * - Array は順序保持
 * - undefined は null に寄せる（安定）
 */
function stableNormalize(v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;

  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;

  if (Array.isArray(v)) return v.map(stableNormalize);

  if (t === "object") {
    const out: any = {};
    const keys = Object.keys(v).sort();
    for (const k of keys) out[k] = stableNormalize(v[k]);
    return out;
  }

  // function/symbol/bigint 等は string 化（安定が最優先）
  return String(v);
}

export function stableHash(obj: unknown) {
  const norm = stableNormalize(obj as any);
  const json = JSON.stringify(norm);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * 冪等キーの決定ルール
 * 1) リクエストヘッダの Idempotency-Key（最優先）
 * 2) body.requestId / body.idempotencyKey
 * 3) 正規化済み payload の stableHash
 */
export function getIdempotencyKey(req: Request, payload: any) {
  const h =
    req.headers.get("Idempotency-Key") ||
    req.headers.get("idempotency-key") ||
    req.headers.get("x-idempotency-key") ||
    "";

  const key = h || payload?.requestId || payload?.idempotencyKey || stableHash(payload);

  return String(key).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
}