//app/api/cutout/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "fileなし" }, { status: 400 });
  }

  const fwd = new FormData();
  fwd.append("file", file, file.name);

  const res = await fetch("http://localhost:8080/cutout", {
    method: "POST",
    body: fwd,
  });

  if (!res.ok) {
    return NextResponse.json({ error: "cutout失敗" }, { status: 500 });
  }

  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "image/png",
    },
  });
}