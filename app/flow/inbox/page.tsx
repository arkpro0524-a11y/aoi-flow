// /app/flow/inbox/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type Draft = {
  id: string;
  userId: string;
  brand: "vento" | "riva";
  phase: "draft" | "ready" | "posted";
  vision: string;
  caption_final: string;
  imageUrl?: string;
  updatedAt?: any;
};

const UI = {
  headerTitlePx: 20,
  pagePad: 16,

  // PCカード
  cardH: 160,
  cardPad: 14,
  colGap: 14,

  brandW: 140,
  plateH: 110,
  brandPx: 20,

  thumbBox: 130,
  titlePx: 20,

  // Mobile
  mobileBrandLetter: 16,
};

const PLATE_CLASS =
  "rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b] border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)] flex items-center justify-center";

export default function InboxPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qy = query(
      collection(db, "drafts"),
      where("userId", "==", uid),
      where("phase", "==", "ready"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: Draft[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRows(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
        toast.push("投稿待ちの取得に失敗しました");
      }
    );

    return () => unsub();
  }, [uid, authLoading, toast]);

  const ready = useMemo(() => rows, [rows]);

  return (
    <>
      <style jsx>{`
        .cardPC {
          display: none;
        }
        .cardMobile {
          display: block;
        }
        @media (min-width: 1024px) {
          .cardPC {
            display: block;
          }
          .cardMobile {
            display: none;
          }
        }

        /* Mobile */
        .mWrap {
          padding: ${UI.cardPad}px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .mTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .mPlate {
          height: 56px;
          width: 100%;
        }
        .mThumb {
          width: 100%;
          aspect-ratio: 1 / 1;
          height: auto;
        }
        .mCaption {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mMeta {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.55);
        }

        /* PC */
        .pcWrap {
          height: ${UI.cardH}px;
          padding: ${UI.cardPad}px;
          display: grid;
          grid-template-columns: ${UI.brandW}px ${UI.thumbBox}px 1fr 24px;
          column-gap: ${UI.colGap}px;
          align-items: center;
        }
        .pcCaption {
          font-size: ${UI.titlePx}px;
          line-height: 1.15;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="h-full flex flex-col">
        <div className="shrink-0 border-b border-white/10" style={{ padding: UI.pagePad }}>
          <div style={{ fontSize: UI.headerTitlePx, fontWeight: 900 }}>投稿待ち</div>

          {authLoading ? (
            <div className="text-sm text-white/60 mt-1">認証確認中...</div>
          ) : (
            <div className="text-sm text-white/60 mt-1">
              READYのみ表示：{ready.length} 件{loading ? "（読み込み中...）" : ""}
            </div>
          )}
        </div>

        <div className="overflow-y-auto space-y-3" style={{ padding: UI.pagePad }}>
          {authLoading ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              認証確認中...
            </div>
          ) : !uid ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              ログインしてください。
            </div>
          ) : ready.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              投稿待ちがありません。「新規作成 → 投稿待ちにする」で追加されます。
            </div>
          ) : (
            ready.map((d) => (
              <Link
                key={d.id}
                href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
              >
                <div className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition">
                  {/* PC */}
                  <div className="cardPC">
                    <div className="pcWrap">
                      <div className={PLATE_CLASS} style={{ height: UI.plateH }}>
                        <span
                          style={{
                            fontSize: UI.brandPx,
                            fontWeight: 900,
                            letterSpacing: "0.30em",
                            color: "#000",
                          }}
                        >
                          {(d.brand || "vento").toUpperCase()}
                        </span>
                      </div>

                      <div
                        className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                        style={{ width: UI.thumbBox, height: UI.thumbBox, padding: 0 }}
                      >
                        {d.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.imageUrl}
                            alt="thumb"
                            draggable={false}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div className="text-xs text-white/40">NO IMAGE</div>
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div className="pcCaption">
                          {d.caption_final || d.vision || "（本文なし）"}
                        </div>
                        <div className="mt-2 text-xs text-white/55">投稿待ち（READY）</div>
                      </div>

                      <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">
                        →
                      </div>
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="cardMobile">
                    <div className="mWrap">
                      <div className="mTop">
                        <div className={`${PLATE_CLASS} mPlate`}>
                          <span
                            style={{
                              fontSize: UI.mobileBrandLetter,
                              fontWeight: 900,
                              letterSpacing: "0.25em",
                              color: "#000",
                            }}
                          >
                            {(d.brand || "vento").toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">
                          →
                        </div>
                      </div>

                      <div className="mThumb rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10">
                        {d.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.imageUrl}
                            alt="thumb"
                            draggable={false}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div className="text-xs text-white/40">NO IMAGE</div>
                        )}
                      </div>

                      <div>
                        <div className="mCaption">{d.caption_final || d.vision || "（本文なし）"}</div>
                        <div className="mMeta">投稿待ち（READY）</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}