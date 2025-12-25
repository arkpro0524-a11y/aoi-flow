// /app/flow/drafts/page.tsx
"use client";

export default function DraftsPage() {
  return (
    <div className="min-w-0">
      <h1 className="text-[22px] sm:text-[26px] font-black tracking-[0.08em] text-white/90 mb-4">
        下書き一覧
      </h1>

      {/* ✅ ここに「下書きカード一覧」の既存JSXを移す */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 min-w-0">
        {/* 例：下書きカード map */}
      </div>
    </div>
  );
}