// components/UnifiedFlowSidebar.tsx
// AOI FLOW 全体で使う共通左サイドバーです。
// 目的:
// - ページごとに別々のサイドバーを作らない
// - 市場研究ラボと同じ見た目に統一する
// - サブ項目のリンクは既存画面へ正しく接続する
// - 既存機能の中身はこのコンポーネントでは触らない

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

type MarketPanel = "main" | "learning" | "results";

type Props = {
  onLogout?: () => void | Promise<void>;
  marketPanel?: MarketPanel;
  onSelectMarketPanel?: (panel: MarketPanel) => void;
};

const navButtonBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 46,
  borderRadius: 12,
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 850,
  letterSpacing: "0.02em",
  textDecoration: "none",
  border: "1px solid transparent",
  color: "rgba(255,255,255,0.82)",
  background: "transparent",
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
};

const activeButton: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(45, 212, 191, 0.24), rgba(37, 99, 235, 0.20))",
  border: "1px solid rgba(94, 234, 212, 0.42)",
  boxShadow: "0 0 22px rgba(45, 212, 191, 0.18), inset 0 0 18px rgba(255,255,255,0.05)",
  color: "white",
};

const subButtonBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 34,
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.78)",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
};

const subActive: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(37,99,235,0.55), rgba(14,165,233,0.22))",
  border: "1px solid rgba(147,197,253,0.38)",
  color: "white",
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        fontSize: 17,
        opacity: 0.92,
      }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "16px 0 7px", fontSize: 12, color: "rgba(255,255,255,0.52)", fontWeight: 850 }}>
      {children}
    </div>
  );
}

function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} style={{ ...navButtonBase, ...(active ? activeButton : {}) }}>
      <Icon>{icon}</Icon>
      <span>{label}</span>
    </Link>
  );
}

function MarketSubButton(props: {
  panel: MarketPanel;
  label: string;
  current?: MarketPanel;
  onSelect?: (panel: MarketPanel) => void;
}) {
  if (props.onSelect) {
    return (
      <button
        type="button"
        onClick={() => props.onSelect?.(props.panel)}
        style={{ ...subButtonBase, ...(props.current === props.panel ? subActive : {}) }}
      >
        {props.label}
      </button>
    );
  }

  return (
    <Link
      href={`/flow/market-research?panel=${props.panel}`}
      style={{ ...subButtonBase, ...(props.current === props.panel ? subActive : {}) }}
    >
      {props.label}
    </Link>
  );
}

export default function UnifiedFlowSidebar(props: Props) {
  const pathname = usePathname();

  const isMarket = pathname === "/flow/market-research";
  const isProduct = pathname === "/flow/drafts/new" || pathname === "/flow/drafts" || pathname === "/flow/posted";
  const isSell = pathname === "/flow/sell-check";
  const isLibrary = pathname === "/flow/library";
  const isSettings = pathname === "/flow/brands";
  const isTop = pathname === "/flow";

  const marketPanel = props.marketPanel ?? "main";

  return (
    <aside
      className="unifiedFlowSidebar"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: 244,
        padding: 16,
        borderRight: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(2, 12, 25, 0.88), rgba(3, 25, 41, 0.74))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        color: "white",
      }}
    >
      <div className="unifiedFlowSidebarBrand" style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 22 }}>
        <img
          src="/logo-aoi-flow2.png"
          alt="AOI FLOW"
          style={{
            width: 50,
            height: 50,
            borderRadius: 12,
            boxShadow: "0 0 22px rgba(37, 99, 235, 0.35)",
          }}
        />
        <div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "0.05em" }}>AOI FLOW</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.68)" }}>Caption Studio</div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.09)", margin: "0 -16px 16px" }} />

      <nav className="unifiedFlowSidebarNav" style={{ display: "grid", gap: 7 }}>
        <NavLink href="/flow" icon="⌂" label="トップ" active={isTop} />

        <SectionTitle>市場研究</SectionTitle>
        <NavLink href="/flow/market-research" icon="⌘" label="市場研究ラボ" active={isMarket} />
        {isMarket ? (
          <div style={{ display: "grid", gap: 7, paddingLeft: 36, marginTop: 2 }}>
            <MarketSubButton panel="main" label="市場研究ラボを開く" current={marketPanel} onSelect={props.onSelectMarketPanel} />
            <MarketSubButton panel="learning" label="学習データ管理" current={marketPanel} onSelect={props.onSelectMarketPanel} />
            <MarketSubButton panel="results" label="8項目分析結果" current={marketPanel} onSelect={props.onSelectMarketPanel} />
          </div>
        ) : null}

        <NavLink href="/flow/sell-check" icon="◇" label="売れる診断" active={isSell} />

        <NavLink href="/flow/drafts/new" icon="▣" label="商品画像作成" active={isProduct} />
        {isProduct ? (
          <div style={{ display: "grid", gap: 7, paddingLeft: 36, marginTop: 2 }}>
            <Link href="/flow/drafts/new" style={{ ...subButtonBase, ...(pathname === "/flow/drafts/new" ? subActive : {}) }}>
              新規作成
            </Link>
            <Link href="/flow/drafts" style={{ ...subButtonBase, ...(pathname === "/flow/drafts" ? subActive : {}) }}>
              下書き一覧
            </Link>
            <Link href="/flow/posted" style={{ ...subButtonBase, ...(pathname === "/flow/posted" ? subActive : {}) }}>
              投稿済み
            </Link>
          </div>
        ) : null}

        <NavLink href="/flow/library" icon="▤" label="ライブラリ" active={isLibrary} />

        <SectionTitle>設定</SectionTitle>
        <NavLink href="/flow/brands" icon="⚙" label="設定" active={isSettings} />
      </nav>

      <div className="unifiedFlowSidebarBottom" style={{ marginTop: "auto", display: "grid", gap: 12 }}>
        <button
          type="button"
          onClick={() => void props.onLogout?.()}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.88)",
            padding: "11px 12px",
            fontWeight: 850,
            cursor: "pointer",
          }}
        >
          ログアウト
        </button>
      </div>

      <style jsx global>{`
        @media (max-width: 980px) {
          .unifiedFlowSidebar {
            position: sticky !important;
            top: 0 !important;
            bottom: auto !important;
            width: 100% !important;
            max-width: 100vw !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 10px 10px 8px !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(255,255,255,0.10) !important;
            z-index: 50 !important;
            display: block !important;
            overflow: visible !important;
          }

          .unifiedFlowSidebarBrand {
            padding-bottom: 8px !important;
            gap: 9px !important;
          }

          .unifiedFlowSidebarBrand img {
            width: 38px !important;
            height: 38px !important;
            border-radius: 10px !important;
          }

          .unifiedFlowSidebarBrand div div:first-child {
            font-size: 17px !important;
            line-height: 1.05 !important;
          }

          .unifiedFlowSidebarBrand div div:last-child {
            font-size: 10px !important;
            margin-top: 2px !important;
          }

          .unifiedFlowSidebarNav {
            display: flex !important;
            gap: 8px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 4px 0 8px !important;
            -webkit-overflow-scrolling: touch !important;
            scroll-snap-type: x proximity;
          }

          .unifiedFlowSidebarNav > a,
          .unifiedFlowSidebarNav > button {
            flex: 0 0 auto !important;
            min-height: 38px !important;
            width: auto !important;
            white-space: nowrap !important;
            padding: 0 12px !important;
            font-size: 12px !important;
            scroll-snap-align: start;
          }

          .unifiedFlowSidebarNav > div {
            flex: 0 0 auto !important;
            display: flex !important;
            gap: 7px !important;
            padding-left: 0 !important;
            margin-top: 0 !important;
            align-items: center !important;
          }

          .unifiedFlowSidebarNav > div[style*="font-size"] {
            display: none !important;
          }

          .unifiedFlowSidebarNav > div a,
          .unifiedFlowSidebarNav > div button {
            flex: 0 0 auto !important;
            min-height: 34px !important;
            width: auto !important;
            white-space: nowrap !important;
            padding: 0 10px !important;
            font-size: 11px !important;
          }

          .unifiedFlowSidebarBottom {
            display: none !important;
          }
        }
      `}</style>
    </aside>
  );
}
