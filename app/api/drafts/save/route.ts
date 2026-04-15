// /app/api/drafts/save/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import admin from "firebase-admin";

import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";

/*
AOI FLOW
Draft 保存 API

目的
・正式スキーマで保存
・ユーザー偽装防止
・undefined排除
・createdAt / updatedAt 管理

正式スキーマ
{
  brandId
  vision
  keywords
  igCaption
  xCaption
  shortCopies

  baseImageUrl
  aiImageUrl
  compositeImageUrl

  videoUrl
  videoSettings

  images

  // 今回追加
  backgroundSourceTab
  templateBgUrl
  templateBgUrls
  templateBgSelectedId
  templateBgRecommendedIds
  templateBgRecommendations
}

今回の修正ポイント
・既存コードは消さずに維持
・vision だけ保存漏れしていたため追加
・keywords と同じように、vision も normalizePatch で正式保存対象に入れる
*/

/* ------------------------------- */
/* 型補助 */
/* ------------------------------- */

type JsonLikeObject = Record<string, unknown>;

/* ------------------------------- */
/* undefined除去 */
/* ------------------------------- */

/**
 * 再帰的に undefined を除去する
 *
 * 注意
 * - object 以外も入りうるので戻り値は unknown にしている
 * - 最後に API 本体側で object であることを確定させて使う
 */
function stripUndefinedDeep(input: unknown): unknown {
  const walk = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      for (const v of value) {
        const r = walk(v);
        if (r !== undefined) arr.push(r);
      }
      return arr;
    }

    if (typeof value === "object" && value !== null) {
      const out: JsonLikeObject = {};
      for (const [k, v] of Object.entries(value as JsonLikeObject)) {
        const r = walk(v);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }

    return value;
  };

  return walk(input);
}

/**
 * unknown を安全に object 化する
 * - spread で使う前に必ずこれを通す
 */
function asObject(value: unknown): JsonLikeObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonLikeObject;
  }
  return {};
}

/* ------------------------------- */
/* ブランド正規化 */
/* ------------------------------- */

function normalizeBrandId(v: unknown): "vento" | "riva" {
  if (v === "riva") return "riva";
  return "vento";
}

function normalizeBackgroundSourceTab(v: unknown): "template_bg" | "ai_bg" {
  return v === "template_bg" ? "template_bg" : "ai_bg";
}

function normalizeStringArray(input: unknown, limit = 30): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") continue;

    const s = item.trim();
    if (!s) continue;
    if (seen.has(s)) continue;

    seen.add(s);
    out.push(s);

    if (out.length >= limit) break;
  }

  return out;
}

function normalizeTemplateBgRecommendations(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const raw = item as Record<string, unknown>;

      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
      const score =
        typeof raw.score === "number" && Number.isFinite(raw.score)
          ? raw.score
          : Number.isFinite(Number(raw.score))
            ? Number(raw.score)
            : 0;

      if (!id) return null;

      return {
        id,
        score,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

/* ------------------------------- */
/* patch正規化 */
/* ------------------------------- */

function normalizePatch(input: Record<string, unknown>, uid: string): JsonLikeObject {
  const patch: JsonLikeObject = {};

  patch.userId = uid;

  if ("brandId" in input) {
    patch.brandId = normalizeBrandId(input.brandId);
  }

  /**
   * 今回の本質修正
   * - Vision がフロントから送られてきても、
   *   これまではここで拾っていなかった
   * - そのため DB 保存対象から落ちていた
   * - keywords と同じく正式保存対象へ追加する
   */
  if ("vision" in input && typeof input.vision === "string") {
    patch.vision = input.vision;
  }

  if ("keywords" in input && typeof input.keywords === "string") {
    patch.keywords = input.keywords;
  }

  if ("igCaption" in input) patch.igCaption = input.igCaption;
  if ("xCaption" in input) patch.xCaption = input.xCaption;
  if ("shortCopies" in input) patch.shortCopies = input.shortCopies;

  if ("baseImageUrl" in input) patch.baseImageUrl = input.baseImageUrl;
  if ("aiImageUrl" in input) patch.aiImageUrl = input.aiImageUrl;
  if ("compositeImageUrl" in input) patch.compositeImageUrl = input.compositeImageUrl;

  if ("videoUrl" in input) patch.videoUrl = input.videoUrl;
  if ("videoSettings" in input) patch.videoSettings = input.videoSettings;

  if ("images" in input) patch.images = input.images;

  // -------------------------
  // テンプレ背景系
  // -------------------------

  if ("backgroundSourceTab" in input) {
    patch.backgroundSourceTab = normalizeBackgroundSourceTab(input.backgroundSourceTab);
  }

  if ("templateBgUrl" in input) {
    patch.templateBgUrl = input.templateBgUrl;
  }

  if ("templateBgUrls" in input) {
    patch.templateBgUrls = normalizeStringArray(input.templateBgUrls, 30);
  }

  if ("templateBgSelectedId" in input) {
    patch.templateBgSelectedId = input.templateBgSelectedId;
  }

  if ("templateBgRecommendedIds" in input) {
    patch.templateBgRecommendedIds = normalizeStringArray(input.templateBgRecommendedIds, 10);
  }

  if ("templateBgRecommendations" in input) {
    patch.templateBgRecommendations = normalizeTemplateBgRecommendations(
      input.templateBgRecommendations
    );
  }

  return patch;
}

/* ------------------------------- */
/* API本体 */
/* ------------------------------- */

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const body = (await req.json().catch(() => ({}))) as {
      draftId?: string;
      patch?: Record<string, unknown>;
    };

    if (!body.patch || typeof body.patch !== "object") {
      return NextResponse.json(
        { ok: false, error: "patch required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const col = db.collection("drafts");

    const patch = normalizePatch(body.patch, user.uid);

    /**
     * ここが今回の型エラー修正ポイント
     * - stripUndefinedDeep() は unknown を返す
     * - そのままだと spread できない
     * - まず object に確定させてから使う
     */
    const payload = asObject(
      stripUndefinedDeep({
        ...patch,
        userId: user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    );

    /* ---------------- */
    /* 新規作成 */
    /* ---------------- */

    if (!body.draftId) {
      const createPayload: JsonLikeObject = {
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ref = await col.add(createPayload);

      return NextResponse.json({
        ok: true,
        draftId: ref.id,
      });
    }

    /* ---------------- */
    /* 更新 */
    /* ---------------- */

    const ref = col.doc(body.draftId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "draft not found" },
        { status: 404 }
      );
    }

    const data = snap.data() || {};

    if (String(data.userId) !== user.uid) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    await ref.set(payload as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>, {
      merge: true,
    });

    return NextResponse.json({
      ok: true,
      draftId: body.draftId,
    });
  } catch (e: any) {
    console.error("[draft/save]", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "save failed" },
      { status: 500 }
    );
  }
}