//app/api/cm-generate/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { draftId } = body ?? {};

    if (!draftId) {
      return NextResponse.json({ error: "draftId required" }, { status: 400 });
    }

    // TODO: worldSpec + 入力を Runway に送る
    // いまは仮で taskId を生成して返す
    const taskId = `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return NextResponse.json({ taskId }, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}