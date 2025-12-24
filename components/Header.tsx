"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  // ✅ ログイン画面・FLOW配下はHeader不要（FlowShellが担当）
  if (pathname === "/login" || pathname.startsWith("/flow")) return null;

  return (
    <header className="sticky top-0 z-20 bg-black/20 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 text-sm font-semibold">
            A
          </div>
          <div>
            <div className="text-sm font-semibold">AOI</div>
            <div className="text-[11px] text-white/70">Home</div>
          </div>
        </Link>
      </div>
    </header>
  );
}