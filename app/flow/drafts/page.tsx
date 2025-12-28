// /app/flow/drafts/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
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

/**
 * ✅ ここだけ：サイズ調整（巨人UIを解消）
 * - ロジック/Firestore/Link は一切触らない
 * - “一覧” として見やすい標準サイズへ
 * ✅ 追加：スマホ専用UI（md未満）
 * - PCカードDOMは維持し、スマホは1列カードにする
 */
const HEADER_TITLE_PX = 20;
const CARD_H = 160;
const BRAND_W = 140;
const PLATE_H = 110;
const THUMB_BOX = 130;
const THUMB_PAD = 0;
const TITLE_PX = 20;
const BRAND_PX = 20;

const PAGE_PAD = 16;
const CARD_PAD = 14;
const COL_GAP = 14;

function chipText(brand: Brand, phase: Phase) {
  const b = brand === "riva" ? "RIVA" : "VENTO";
  const p = phase === "ready" ? "投稿待ち" : phase === "posted" ? "投稿済み" : "下書き";
  return `${b} / ${p}`;
}

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
            data.phase === "ready"
              ? "ready"
              : data.phase === "posted"
              ? "posted"
              : "draft";
          return {
            id: doc.id,
            userId: uid,
            brand,
            phase,
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final:
              typeof data.caption_final === "string" ? data.caption_final : "",
            imageUrl:
              typeof data.imageUrl === "string" && data.imageUrl
                ? data.imageUrl
                : undefined,
            updatedAt: data.updatedAt,
          };
        });
        setRows(list);
      } catch {
        toast.push("の取得に失敗しました");
        setRows([]);
      }
    })();
  }, [uid, toast]);

  const empty = rows.length === 0;

  const MobileCard = (d: DraftRow) => {
    const title = d.caption_final || d.vision || "（未入力）";
    return (
      <Link
        key={d.id}
        href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
        className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
      >
        <div className="rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-white/65 font-bold">
                {chipText(d.brand, d.phase)}
              </div>
              <div
                className="mt-1 font-black text-white/95"
                style={{
                  fontSize: 16,
                  lineHeight: 1.2,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {title}
              </div>
            </div>

            <div className="shrink-0 text-white/50 font-black">→</div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div
              className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
              style={{ width: 92, height: 92 }}
            >
              {d.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.imageUrl}
                  alt="thumb"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div className="text-[11px] text-white/40">NO IMAGE</div>
              )}
            </div>

            <div className="text-xs text-white/55">
              タップで編集
              <div className="mt-1 text-[11px] text-white/45">
                {d.phase === "ready" ? "投稿待ち" : d.phase === "posted" ? "投稿済み" : "下書き"}
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-white/10" style={{ padding: PAGE_PAD }}>
        <div style={{ fontSize: HEADER_TITLE_PX, fontWeight: 900 }}>下書き一覧</div>
      </div>

      <div className="overflow-y-auto" style={{ padding: PAGE_PAD }}>
        {empty ? (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-white/75">
            下書きがまだありません。
          </div>
        ) : (
          <>
            {/* ✅ スマホ専用（md未満） */}
            <div className="block md:hidden space-y-3">
              {rows.map((d) => MobileCard(d))}
            </div>

            {/* ✅ PC専用（md以上）※現行PCカードDOMを維持 */}
            <div className="hidden md:block space-y-3">
              {rows.map((d) => (
                <Link
                  key={d.id}
                  href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                  className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
                >
                  <div
                    className="group rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition"
                    style={{
                      height: CARD_H,
                      display: "grid",
                      gridTemplateColumns: `${BRAND_W}px ${THUMB_BOX}px 1fr 24px`,
                      columnGap: COL_GAP,
                      alignItems: "center",
                      padding: CARD_PAD,
                    }}
                  >
                    <div
                      className="rounded-xl bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b]
                             border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]
                             flex items-center justify-center"
                      style={{ height: PLATE_H }}
                    >
                      <span
                        style={{
                          fontSize: BRAND_PX,
                          fontWeight: 900,
                          letterSpacing: "0.30em",
                          color: "#000",
                        }}
                      >
                        {d.brand.toUpperCase()}
                      </span>
                    </div>

                    <div
                      className="rounded-xl bg-white/6 overflow-hidden flex items-center justify-center ring-1 ring-white/10"
                      style={{
                        width: THUMB_BOX,
                        height: THUMB_BOX,
                        padding: THUMB_PAD,
                      }}
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
                      <div
                        style={{
                          fontSize: TITLE_PX,
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

                    <div className="text-xl text-white/35 group-hover:text-white/80 transition text-right">
                      →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}