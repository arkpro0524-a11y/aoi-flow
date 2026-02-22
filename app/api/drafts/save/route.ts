// app/api/drafts/save/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin";
import admin from "firebase-admin";

function stripUndefinedDeep(input: any): any {
  const walk = (v: any): any => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (Array.isArray(v)) {
      const out: any[] = [];
      for (const item of v) {
        const w = walk(item);
        if (w !== undefined) out.push(w);
      }
      return out;
    }
    if (typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        const w = walk(val);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return walk(input);
}

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);

    const body = await req.json().catch(() => ({}));
    const draftId = String(body?.draftId || "").trim() || null;
    const patch = body?.patch ?? {};
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ ok: false, error: "patch is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const col = db.collection("drafts");

    const payload = stripUndefinedDeep({
      ...patch,
      userId: user.uid, // ✅ なりすまし禁止：サーバが上書き
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ✅ 新規作成
    if (!draftId) {
      const ref = await col.add({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, draftId: ref.id });
    }

    // ✅ 既存更新（所有者チェック）
    const ref = col.doc(draftId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });

    const cur = snap.data() || {};
    if (String(cur.userId || "") !== user.uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, draftId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "save draft failed" }, { status: 500 });
  }
}