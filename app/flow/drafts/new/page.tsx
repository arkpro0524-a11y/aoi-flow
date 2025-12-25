// /app/flow/drafts/new/page.tsx
"use client";

import FlowPageGrid from "@/components/FlowPageGrid";

export default function NewDraftPage() {
  return (
    <FlowPageGrid
      left={
        <>
          {/* ✅ ここに「左側（入力フォーム）」の既存JSXを丸ごと移す */}
          {/* 例：Brand / Vision / Keywords / 生成ボタン / 保存ボタン / IG本文 / X本文 / メモ など */}
        </>
      }
      right={
        <>
          {/* ✅ ここに「右側（プレビュー）」の既存JSXを丸ごと移す */}
          {/* 例：正方形プレビュー / 文字表示 / スライダー / 画像生成プレビュー など */}
        </>
      }
    />
  );
}