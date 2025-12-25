// /components/FlowPageGrid.tsx
"use client";

import React from "react";

type Props = {
  left: React.ReactNode;   // 入力フォーム側
  right: React.ReactNode;  // プレビュー側
};

export default function FlowPageGrid({ left, right }: Props) {
  return (
    <div className="w-full min-w-0">
      {/* スマホ=1列 / lg以上=2列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 min-w-0">
        <section className="min-w-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            {left}
          </div>
        </section>

        <section className="min-w-0">
          {/* スマホは下に落ちる。PCは右固定の見た目 */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            {right}
          </div>
        </section>
      </div>
    </div>
  );
}