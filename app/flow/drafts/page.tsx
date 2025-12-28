// /app/flow/drafts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, limit, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Brand = "vento" | "riva";
type Phase = "draft" | "ready" | "posted";
type DraftRow = {
  id: string;
  userId: string;
  brand: Brand;
  phase: Phase;
  vision: string;
  caption_final: string;
  imageUrl?: string;
  updatedAt?: any;
};

const UI = {
  headerTitlePx: 20,
  pagePad: 16,
  cardH: 160,
  cardPad: 14,
  colGap: 14,
  brandW: 140,
  plateH: 110,
  brandPx: 20,
  thumbBox: 130,
  titlePx: 20,
};

export default function DraftsPage() {
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      return;
    }
    (async () => {
      try {
        const qy = query(
          collection(db, "drafts"),
          where("userId", "==", uid),
          orderBy("updatedAt", "desc"),
          limit(100)
        );

        const snap = await getDocs(qy);

        const list: DraftRow[] = snap.docs.map((doc) => {
          const data = doc.data() as DocumentData;
          const brand: Brand = data.brand === "riva" ? "riva" : "vento";
          const phase: Phase =
            data.phase === "ready" ? "ready" : data.phase === "posted" ? "posted" : "draft";

          return {
            id: doc.id,
            userId: uid,
            brand,
            phase,
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final: typeof data.caption_final === "string" ? data.caption_final : "",
            imageUrl: typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : undefined,
            updatedAt: data.updatedAt,
          };
        });

        setRows(list);
      } catch (e) {
        console.error(e);
        toast.push("下書き一覧の取得に失敗しました");
        setRows([]);
      }
    })();
  }, [uid, toast]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-white/10" style={{ padding: UI.pagePad }}>
        <div style={{ fontSize: UI.headerTitlePx, fontWeight: 900 }}>下書き一覧</div>
      </div>

      <div className="overflow-y-auto space-y-3" style={{ padding: UI.pagePad }}>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-white/75">
            下書きがまだありません。
          </div>
        ) : (
          rows.map((d) => (
            <Link
              key={d.id}
              href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
              className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
            >
              {/* ✅ SPは縦 / PCは4列grid */}
              <div
                className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition"
                style={{ padding: UI.cardPad }}
              >
                <div
                  className="grid items-center"
                  style={{
                    gap: UI.colGap,
                    gridTemplateColumns: "1fr",
                  }}
                >
                  {/* PCだけ横並び */}
                  <div className="hidden lg:grid" style={{
                    height: UI.cardH,
                    gridTemplateColumns: `${UI.brandW}px ${UI.thumbBox}px 1fr 24px`,
                    columnGap: UI.colGap,
                    alignItems: "center",
                  }}>
                    <div
                      className="rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b]
                                 border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]
                                 flex items-center justify-center"
                      style={{ height: UI.plateH }}
                    >
                      <span style={{ fontSize: UI.brandPx, fontWeight: 900, letterSpacing: "0.30em", color: "#000" }}>
                        {d.brand.toUpperCase()}
                      </span>
                    </div>

                    <div
                      className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                      style={{ width: UI.thumbBox, height: UI.thumbBox }}
                    >
                      {d.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.imageUrl} alt="thumb" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                      ) : (
                        <div className="text-xs text-white/40">NO IMAGE</div>
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: UI.titlePx,
                          fontWeight: 900,
                          lineHeight: 1.15,
                          color: "rgba(255,255,255,0.95)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {d.caption_final || d.vision || "（未入力）"}
                      </div>
                    </div>

                    <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">→</div>
                  </div>

                  {/* SP表示 */}
                  <div className="lg:hidden flex items-center gap-3">
                    <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-black">
                      {d.brand.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-base truncate">
                        {d.caption_final || d.vision || "（未入力）"}
                      </div>
                      <div className="mt-1 text-xs text-white/60">タップで編集</div>
                    </div>
                    <div className="text-lg text-white/40">→</div>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}