//app/api/cm-status/route.ts
import { NextResponse } from "next/server";

async function requireAuth(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("no token");
  return auth.replace("Bearer ", "").trim();
}

export async function POST(req: Request) {
  try {
    await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.taskId ?? "").trim();
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    // ✅ TODO: Runwayのステータスを問い合わせる
    // 返却形式だけ固定（事故ゼロ）
    // status: queued | running | succeeded | failed
    const status = "running";

    // 完了時は videoUrl を返す
    const videoUrl = "";

    return NextResponse.json({ status, videoUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "cm-status error" }, { status: 401 });
  }
}