// /app/flow/inbox/page.tsx
"use client";

export default function InboxPage() {
  return (
    <div className="min-w-0">
      <h1 className="text-[22px] sm:text-[26px] font-black tracking-[0.08em] text-white/90 mb-4">
        投稿待ち
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 min-w-0">
        {/* ✅ ここに「投稿待ちカード一覧」の既存JSXを移す */}
      </div>
    </div>
  );
}