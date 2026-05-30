// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 触らない
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/public") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // /flow 配下はクライアントで AuthGate が守る（ここは軽く）
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};