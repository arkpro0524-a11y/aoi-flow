// app/page.tsx
// AOI FLOW のトップページ。
// 既存機能・既存導線は削除せず、表の入口だけを5カードに整理します。

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/firebase";

type MenuItem = {
  href: string;
  image: string;
  alt: string;
  label: string;
  description: string;
  links?: { href: string; label: string }[];
};

const MENU_ITEMS: MenuItem[] = [
  {
    href: "/flow/market-research",
    image: "/product_selector_logo.png",
    alt: "Market Research Lab",
    label: "市場研究ラボ",
    description: "市場情報を保存・学習・理論化する",
  },
  {
    href: "/flow/sell-check",
    image: "/sales_diagnosis_logo.png",
    alt: "Sell Check",
    label: "売れる診断",
    description: "DB判定・理論判定・統合判定",
  },
  {
    href: "/flow/drafts/new",
    image: "/text-video-logo.png",
    alt: "AOI FLOW Creation",
    label: "商品画像作成",
    description: "商品画像・説明文・SNS文を作る",
    links: [
      { href: "/flow/drafts/new", label: "新規作成" },
      { href: "/flow/drafts", label: "下書き一覧" },
      { href: "/flow/posted", label: "投稿済み" },
    ],
  },
  {
    href: "/flow/library",
    image: "/image_library_logo.png",
    alt: "Library",
    label: "ライブラリ",
    description: "市場カード・理論DB・画像を保管",
  },
  {
    href: "/flow/brands",
    image: "/settings_logo.png",
    alt: "Settings",
    label: "設定",
    description: "ブランド・運用設定",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) {
      setChecking(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (!u) router.replace("/login");
    });

    return () => unsub();
  }, [router]);

  async function handleLogout() {
    if (!auth) return;
    await signOut(auth);
    router.replace("/login");
  }

  if (checking || !user) {
    return (
      <main style={{ minHeight: "100vh", background: "#0F1E30", color: "white" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            letterSpacing: "0.2em",
            opacity: 0.65,
          }}
        >
          LOADING
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        overflowX: "hidden",
        color: "#0F1E30",
        backgroundImage:
          "linear-gradient(rgba(248,250,252,0.58), rgba(248,250,252,0.76)), url('/flow-bg-tech1.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <button
        onClick={handleLogout}
        style={{
          position: "fixed",
          left: 16,
          top: 16,
          zIndex: 30,
          borderRadius: 9999,
          border: "1px solid rgba(28,79,130,0.18)",
          background: "rgba(255,255,255,0.58)",
          padding: "9px 14px",
          fontSize: 12,
          fontWeight: 900,
          color: "#1C4F82",
          backdropFilter: "blur(12px)",
        }}
      >
        ログアウト
      </button>

      <section
        style={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: 1180,
          margin: "0 auto",
          padding: "72px 20px 46px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <img
            src="/icon-192.png"
            alt="AOI FLOW"
            style={{
              width: 92,
              height: 92,
              objectFit: "contain",
              borderRadius: 9999,
              boxShadow: "0 18px 45px rgba(28,79,130,0.22)",
            }}
          />
          <h1
            style={{
              marginTop: 24,
              marginBottom: 0,
              fontSize: "clamp(42px, 6vw, 80px)",
              fontWeight: 900,
              letterSpacing: "0.28em",
            }}
          >
            AOI FLOW
          </h1>
          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: "clamp(16px, 2vw, 24px)",
              letterSpacing: "0.32em",
              color: "#1C4F82",
              fontWeight: 700,
            }}
          >
            Caption Studio
          </p>
        </div>

        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 18,
          }}
        >
          {MENU_ITEMS.map((item) => (
            <article
              key={item.href}
              style={{
                minHeight: 245,
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.64)",
                background: "rgba(255,255,255,0.52)",
                boxShadow: "0 22px 60px rgba(28,79,130,0.14)",
                backdropFilter: "blur(14px)",
                padding: 18,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Link href={item.href} style={{ color: "inherit", textDecoration: "none" }}>
                <img
                  src={item.image}
                  alt={item.alt}
                  style={{
                    width: 82,
                    height: 82,
                    maxWidth: 82,
                    maxHeight: 82,
                    objectFit: "contain",
                    borderRadius: 18,
                    display: "block",
                    margin: "0 auto",
                  }}
                />
                <h2
                  style={{
                    margin: "18px 0 0",
                    fontSize: 20,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  {item.label}
                </h2>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    lineHeight: 1.7,
                    fontWeight: 700,
                    color: "#1C4F82",
                  }}
                >
                  {item.description}
                </p>
              </Link>

              {item.links ? (
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {item.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{
                        borderRadius: 9999,
                        border: "1px solid rgba(28,79,130,0.22)",
                        background: "rgba(255,255,255,0.62)",
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 900,
                        color: "#1C4F82",
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
        </div>
      </section>
    </main>
  );
}
