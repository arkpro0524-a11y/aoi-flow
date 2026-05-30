//app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/firebase";

const MENU_ITEMS = [
  {
    href: "/flow/drafts",
    image: "/text-video-logo.png",
    alt: "Text & Video Creation",
    label: "文章・動画作成",
  },
  {
    href: "/flow/sell-check/admin",
    image: "/data_collection_logo.png",
    alt: "Data Collection",
    label: "データ収集",
  },
  {
    href: "/flow/sell-check",
    image: "/sales_diagnosis_logo.png",
    alt: "Sales Diagnosis",
    label: "売れる診断",
  },
];

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

  if (!ready) {
    return <div className="min-h-screen bg-[#f8fafc]" />;
  }

  if (!user) {
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

        <div className="relative z-10 flex min-h-screen items-end justify-center pb-16">
          <div className="w-full max-w-[1400px] px-6">
            <div className="grid grid-cols-3 gap-8">
              {MENU_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-[2rem] bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,30,48,0.16)] backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/90"
                >
                  <div className="flex h-[390px] items-center justify-center rounded-[1.5rem] bg-white">
                    <img
                      src={item.image}
                      alt={item.alt}
                      draggable={false}
                      className="max-h-[90%] max-w-[90%] object-contain transition duration-300 group-hover:scale-[1.05]"
                    />
                  </div>

                  <div className="mt-4 text-center text-base font-black tracking-[0.18em] text-[#1c4f82]">
                    {item.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}