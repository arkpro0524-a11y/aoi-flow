// app/page.tsx
// AOI FLOW のログイン後トップページ。
// 元のトップ画面のロゴ位置・大きさを保ちながら、入口カードだけを全機能用に増やしています。
// 既存機能は削除せず、リンク先を増やすだけの修正です。
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/firebase";

type MenuItem = {
  href: string;
  image?: string;
  emoji?: string;
  alt: string;
  label: string;
  description: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    href: "/flow/drafts/new",
    image: "/text-video-logo.png",
    alt: "Text & Video Creation",
    label: "新規作成",
    description: "文章・画像・動画を作る",
  },
  {
    href: "/flow/drafts",
    image: "/drafts_logo.png",
    alt: "Drafts",
    label: "下書き一覧",
    description: "作成中の投稿を確認",
  },
  {
    href: "/flow/library",
    image: "/image_library_logo.png",
    alt: "Image Library",
    label: "画像ライブラリ",
    description: "背景・完成画像を再利用",
  },
  {
    href: "/flow/product-selector",
    image: "/product_selector_logo.png",
    alt: "Product Selector",
    label: "商品選定",
    description: "市場スクショから候補を見る",
  },
  {
    href: "/flow/sell-check",
    image: "/sales_diagnosis_logo.png",
    alt: "Sales Diagnosis",
    label: "売れる診断",
    description: "価格・利益・仕入れ判断",
  },
  {
    href: "/flow/sell-check/admin",
    image: "/data_collection_logo.png",
    alt: "Data Collection",
    label: "学習データ管理",
    description: "本文・画像・CSVを蓄積",
  },
  {
    href: "/flow/posted",
    image: "/posted_logo.png",
    alt: "Posted",
    label: "投稿済み",
    description: "出品・売却結果を確認",
  },
  {
    href: "/flow/brands",
    image: "/settings_logo.png",
    alt: "Settings",
    label: "設定",
    description: "ブランド・運用設定",
  },
];

function MenuCard({ item }: { item: MenuItem }) {
  return (
    <Link
      href={item.href}
      className="group flex min-h-[158px] flex-col items-center justify-center rounded-[1.4rem] bg-white/30 px-4 py-4 text-center shadow-[0_16px_44px_rgba(15,30,48,0.10)] backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/44"
    >
      {/*
        ロゴ画像そのものに余白があるため、カード側の白い内枠を廃止しています。
        これで「透明な枠の中に小さく入っている」見え方を抑え、ロゴを主役にします。
      */}
      <div className="flex h-[108px] w-[108px] items-center justify-center">
        {item.image ? (
          <img
            src={item.image}
            alt={item.alt}
            draggable={false}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="text-center text-[#0f1e30]">
            <div className="text-4xl leading-none">{item.emoji}</div>
            <div className="mt-2 text-[9px] font-black tracking-[0.22em] text-[#1c4f82]/70">
              {item.alt}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-[15px] font-black tracking-[0.16em] text-[#1c4f82]">
        {item.label}
      </div>
      <div className="mt-1 text-[11px] font-bold leading-4 text-[#0f1e30]/68">
        {item.description}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);

      if (!u) {
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [router]);

  async function logout() {
    await signOut(auth);
    router.replace("/login");
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-[#f8fafc]" />;
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#0f1e30]">
      <section className="relative min-h-screen overflow-hidden">
        <img
          src="/top-bg.png"
          alt="AOI FLOW background"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        <div className="absolute inset-0 bg-white/20" />

        <button
          type="button"
          onClick={logout}
          className="absolute right-6 top-6 z-30 rounded-full bg-white/80 px-5 py-3 text-sm font-black text-[#0f1e30] shadow-[0_12px_34px_rgba(15,30,48,0.18)] backdrop-blur-md transition hover:bg-white"
        >
          ログアウト
        </button>

        {/* 元のトップ画面と同じ考え方：ロゴは画面上部45%の中央に固定 */}
        <div className="absolute left-0 top-0 z-10 flex h-[45%] w-full items-center justify-center">
          <div className="text-center">
            <div className="mb-7 flex justify-center">
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-white/85 shadow-[0_20px_70px_rgba(15,30,48,0.20)] backdrop-blur-md">
                <img
                  src="/logo-aoi-flow1.png"
                  alt="AOI FLOW Logo"
                  className="h-[82%] w-[82%] rounded-full object-contain"
                  draggable={false}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: "clamp(42px, 6vw, 72px)",
                fontWeight: 800,
                letterSpacing: "0.25em",
                color: "#0f1e30",
              }}
            >
              AOI FLOW
            </div>

            <div
              style={{
                marginTop: "10px",
                fontSize: "clamp(14px, 2vw, 18px)",
                letterSpacing: "0.35em",
                color: "#1c4f82",
                opacity: 0.8,
              }}
            >
              Caption Studio
            </div>
          </div>
        </div>

        {/*
          カードは横4列×2段で整理します。
          画面上の余白と背景の美しさを残しつつ、ロゴの周囲の余計な枠を小さくしています。
        */}
        <div className="relative z-10 flex min-h-screen items-end justify-center pb-8 pt-[45vh]">
          <div className="w-full max-w-[1120px] px-5">
            <div className="grid grid-cols-4 gap-x-7 gap-y-5">
              {MENU_ITEMS.map((item) => (
                <MenuCard key={item.href} item={item} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
