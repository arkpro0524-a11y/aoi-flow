// app/api/drafts/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/app/api/_firebase/admin";

function isAdminUid(uid: string): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS || process.env.ADMIN_UIDS || "";

  const adminUids = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return adminUids.includes(uid);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "認証トークンがありません" },
        { status: 401 }
      );
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    if (!isAdminUid(uid)) {
      return NextResponse.json(
        { ok: false, error: "管理者のみ完全削除できます" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const draftId = typeof body?.draftId === "string" ? body.draftId.trim() : "";

    if (!draftId) {
      return NextResponse.json(
        { ok: false, error: "draftId がありません" },
        { status: 400 }
      );
    }

    await adminDb.collection("drafts").doc(draftId).delete();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      { ok: false, error: "下書きの完全削除に失敗しました" },
      { status: 500 }
    );
  }
}