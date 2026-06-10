// app/flow/page.tsx
// AOI FLOW / Vento の表トップ。
// 既存ページ・既存API・既存データは削除せず、表に出す入口だけを5つへ整理します。

import Link from "next/link";

type FeatureCard = {
  href: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
  links?: { href: string; label: string }[];
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    href: "/flow/market-research",
    title: "市場研究ラボ",
    subtitle: "市場情報を保存・学習・理論化して、次の仕入れ判断へつなげる",
    image: "/product_selector_logo.png",
    accent: "Market Research Lab",
  },
  {
    href: "/flow/sell-check",
    title: "売れる診断",
    subtitle: "Market DB・Theory DB・商品画像を統合して価格と仕入れを確認する",
    image: "/sales_diagnosis_logo.png",
    accent: "SELL CHECK",
  },
  {
    href: "/flow/drafts/new",
    title: "商品画像作成",
    subtitle: "商品画像・背景・説明文・SNS文・広告画像を作成する",
    image: "/text-video-logo.png",
    accent: "AOI FLOW",
    links: [
      { href: "/flow/drafts/new", label: "新規作成" },
      { href: "/flow/drafts", label: "下書き一覧" },
      { href: "/flow/posted", label: "投稿済み" },
    ],
  },
  {
    href: "/flow/library",
    title: "ライブラリ",
    subtitle: "市場カード・市場データ・学習データ・理論DB・画像を保管する",
    image: "/image_library_logo.png",
    accent: "Library",
  },
  {
    href: "/flow/brands",
    title: "設定",
    subtitle: "ブランド・運用設定を確認する",
    image: "/settings_logo.png",
    accent: "Settings",
  },
];

export default function FlowHomePage() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        minHeight: "calc(100vh - 210px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 28,
        padding: "22px 4px",
      }}
    >
      <section
        style={{
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(0,0,0,0.20)",
          padding: "24px clamp(18px, 3vw, 34px)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.34em", color: "rgba(255,255,255,0.58)" }}>
          AOI FLOW / VENTO
        </div>
        <h1
          style={{
            margin: "12px 0 0",
            fontSize: "clamp(30px, 4vw, 54px)",
            fontWeight: 900,
            letterSpacing: "0.16em",
            color: "white",
          }}
        >
          市場研究OS
        </h1>
        <p style={{ margin: "16px 0 0", maxWidth: 900, fontSize: 14, lineHeight: 1.9, color: "rgba(255,255,255,0.72)" }}>
          既存機能は削除せず、表の入口だけを整理しています。下書き一覧・投稿済み・学習データ管理・旧分析画面はURLを維持したまま、
          市場研究ラボ / 売れる診断 / 商品画像作成 / ライブラリ / 設定へ収納します。
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {FEATURE_CARDS.map((card) => (
          <article
            key={card.href}
            style={{
              minHeight: 238,
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              padding: 16,
              color: "white",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Link href={card.href} style={{ color: "inherit", textDecoration: "none", display: "flex", flex: 1, flexDirection: "column" }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(210,255,255,0.58)" }}>
                {card.accent}
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 18 }}>
                <img
                  src={card.image}
                  alt={card.title}
                  style={{
                    width: 82,
                    height: 82,
                    maxWidth: 82,
                    maxHeight: 82,
                    objectFit: "contain",
                    borderRadius: 18,
                    display: "block",
                    boxShadow: "0 12px 26px rgba(0,0,0,0.22)",
                  }}
                />
              </div>
              <h2 style={{ margin: "16px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em" }}>{card.title}</h2>
              <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.75, color: "rgba(255,255,255,0.66)" }}>{card.subtitle}</p>
            </Link>

            {card.links ? (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {card.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{
                      borderRadius: 9999,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(0,0,0,0.22)",
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.82)",
                      textDecoration: "none",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
