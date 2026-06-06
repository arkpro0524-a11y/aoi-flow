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
    href: "/flow/market-research",
    image: "/product_selector_logo.png",
    alt: "Market Research",
    label: "市場調査",
    description: "市場発見・理論DB・商品選定",
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
      className="group flex min-h-[210px] flex-col items-center justify-center rounded-[1.4rem] bg-white/12 px-3 py-3 text-center shadow-[0_12px_34px_rgba(15,30,48,0.08)] backdrop-blur-sm transition hover:-translate-y-1 hover:bg-white/24"
    >
      {/*
        ロゴ画像そのものに余白があるため、カード側の白い内枠を廃止しています。
        これで「透明な枠の中に小さく入っている」見え方を抑え、ロゴを主役にします。
      */}
      <div className="flex h-[156px] w-[156px] items-center justify-center">
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

      <div className="mt-1 text-[20px] font-black tracking-[0.14em] text-[#1c4f82]">
        {item.label}
      </div>
      <div className="mt-1 text-[13px] font-bold leading-5 text-[#0f1e30]/72">
        {item.description}
      </div>
    </Link>
  );
}



function MobileMenuCard({ item }: { item: MenuItem }) {
  return (
    <Link
      href={item.href}
      className="group relative flex min-h-[128px] overflow-hidden rounded-[24px] border border-white/70 bg-white/58 px-4 py-4 shadow-[0_16px_40px_rgba(15,30,48,0.12)] backdrop-blur-xl transition active:scale-[0.98]"
    >
      <div className="flex w-full items-center gap-4 pr-7">
        <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center">
          {item.image ? (
            <img
              src={item.image}
              alt={item.alt}
              draggable={false}
              className="h-full w-full object-contain drop-shadow-[0_10px_22px_rgba(28,79,130,0.16)]"
            />
          ) : (
            <div className="text-3xl">{item.emoji}</div>
          )}
        </div>

        <div className="min-w-0 text-left">
          <div className="text-[20px] font-black leading-tight tracking-[0.03em] text-[#0f3f75]">
            {item.label}
          </div>
          <div className="mt-2 text-[13px] font-bold leading-5 text-[#0f1e30]/72">
            {item.description}
          </div>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[32px] font-light leading-none text-[#1c4f82]/82">
          ›
        </div>
      </div>
    </Link>
  );
}

function MobileHome({ onLogout }: { onLogout: () => void }) {
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#0f1e30]">
      <img
        src="/top-bg.png"
        alt="AOI FLOW background"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* スマホ専用の読みやすさ調整。PC画面には一切使いません。 */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/18 via-white/34 to-[#e8f2fb]/86" />
      <div className="absolute inset-x-0 top-0 h-[42vh] bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.86),rgba(255,255,255,0.42)_44%,rgba(255,255,255,0)_75%)]" />

      <button
        type="button"
        onClick={onLogout}
        className="absolute left-5 top-5 z-30 rounded-full bg-white/76 px-4 py-2 text-[13px] font-black text-[#0f3f75] shadow-[0_12px_30px_rgba(15,30,48,0.13)] backdrop-blur-md"
      >
        ログアウト
      </button>

      <div className="relative z-10 px-5 pb-8 pt-24">
        <header className="mb-10 text-center">
          {/* 白い丸背景は使わず、マークだけを背景に直接置く。 */}
          <div className="mb-5 flex items-end justify-center gap-[7px]" aria-label="AOI FLOW mark">
            <span className="block h-9 w-[7px] rounded-full bg-[#1c4f82] shadow-[0_8px_20px_rgba(28,79,130,0.22)]" />
            <span className="block h-12 w-[7px] rounded-full bg-[#1c4f82] shadow-[0_8px_20px_rgba(28,79,130,0.22)]" />
            <span className="block h-16 w-[7px] rounded-full bg-[#1c4f82] shadow-[0_8px_20px_rgba(28,79,130,0.22)]" />
          </div>

          {/* 文字の周囲だけ薄く白を敷いて、背景写真の上でも読めるようにする。 */}
          <div className="mx-auto inline-block rounded-[22px] bg-white/26 px-5 py-3 backdrop-blur-[2px]">
            <div className="font-serif text-[40px] font-semibold leading-none tracking-[0.20em] text-[#0f1e30] drop-shadow-[0_3px_12px_rgba(255,255,255,0.72)]">
              AOI FLOW
            </div>
            <div className="mt-4 text-[17px] font-semibold tracking-[0.28em] text-[#1c4f82]/86">
              Caption Studio
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-2 gap-4" aria-label="AOI FLOW mobile menu">
          {MENU_ITEMS.map((item) => (
            <MobileMenuCard key={item.href} item={item} />
          ))}
        </nav>

        <div className="mt-8 flex items-center justify-center gap-2 text-[14px] font-bold tracking-[0.04em] text-[#1c4f82]/82">
          <span aria-hidden="true">▣</span>
          <span>aoi-flow.com</span>
        </div>
      </div>
    </section>
  );
}

function DesktopHome({ onLogout }: { onLogout: () => void }) {
  return (
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
        onClick={onLogout}
        className="absolute right-6 top-6 z-30 rounded-full bg-white/80 px-5 py-3 text-sm font-black text-[#0f1e30] shadow-[0_12px_34px_rgba(15,30,48,0.18)] backdrop-blur-md transition hover:bg-white"
      >
        ログアウト
      </button>

      {/* PC版は既存トップの構造をそのまま維持します。 */}
      <div className="absolute left-0 top-0 z-10 flex h-[45%] w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-7 flex justify-center">
            <div className="flex h-[132px] w-[132px] items-center justify-center rounded-full bg-white/85 shadow-[0_20px_70px_rgba(15,30,48,0.20)] backdrop-blur-md">
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

      <div className="relative z-10 flex min-h-screen items-end justify-center pb-7 pt-[44vh]">
        <div className="w-full max-w-[1280px] px-5">
          <div className="grid grid-cols-4 gap-x-8 gap-y-5">
            {MENU_ITEMS.map((item) => (
              <MenuCard key={item.href} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    function updateViewportMode() {
      setIsMobile(window.innerWidth < 768);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  async function logout() {
    await signOut(auth);
    router.replace("/login");
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-[#f8fafc]" />;
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#0f1e30]">
      {isMobile ? <MobileHome onLogout={logout} /> : <DesktopHome onLogout={logout} />}
    </main>
  );
}
