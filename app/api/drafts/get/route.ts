// app/api/drafts/get/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUserFromAuthHeader } from "@/app/api/_firebase/admin";
import { getAdminDb } from "@/firebaseAdmin"; // ← あなたの構成に合わせて存在する前提

export async function POST(req: Request) {
  try {
    const user = await requireUserFromAuthHeader(req);
    const body = await req.json().catch(() => ({}));
    const draftId = String(body?.draftId || "").trim();
    if (!draftId) return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 });

    const db = getAdminDb();
    const ref = db.collection("drafts").doc(draftId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
    }

    const data = snap.data() || {};
    if (String(data.userId || "") !== user.uid) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, draftId, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "get draft failed" }, { status: 500 });
  }
}