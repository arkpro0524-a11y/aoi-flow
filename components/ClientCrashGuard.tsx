"use client";

import React from "react";

type Props = { children: React.ReactNode };

/**
 * ✅ 目的：
 * - 本番で「Application error」が出た時に、
 *   “真のエラー文字列” を画面に出して原因確定できるようにする。
 *
 * ✅ 重要：
 * - Hooksの条件分岐をしない（#310回避）
 */
export default class ClientCrashGuard extends React.Component<
  Props,
  { hasError: boolean; message: string }
> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: any) {
    return {
      hasError: true,
      message: err?.message ? String(err.message) : String(err),
    };
  }

  componentDidCatch(err: any) {
    // ここはログ用途（Vercel Logsにも出る）
    console.error("[ClientCrashGuard]", err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          background: "#05070c",
          color: "white",
        }}
      >
        <div style={{ maxWidth: 860, width: "100%" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            Application error (client)
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              padding: 14,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {this.state.message}
          </pre>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 10 }}>
            この全文をそのまま貼れば原因を一発で特定できます。
          </div>
        </div>
      </div>
    );
  }
}