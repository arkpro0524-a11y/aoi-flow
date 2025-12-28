"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  imageUrl?: string; // ✅ data:image でもURLでもOK
  updatedAt?: any;
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
            data.phase === "ready"
              ? "ready"
              : data.phase === "posted"
                ? "posted"
                : "draft";

          const imageUrl =
            typeof data.imageUrl === "string" && data.imageUrl
              ? data.imageUrl
              : undefined;

          return {
            id: doc.id,
            userId: uid,
            brand,
            phase,
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final: typeof data.caption_final === "string" ? data.caption_final : "",
            imageUrl,
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
    <div className="w-full">
      <div className="font-black text-white/95 mb-3" style={{ fontSize: 20 }}>
        下書き一覧
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-white/75">
          下書きがまだありません。
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Link
              key={d.id}
              href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
              className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
            >
              {/* ✅ PC/スマホ自動：スマホは縦、PCは横 */}
              <div className="rounded-2xl border border-white/10 bg-black/25 hover:bg-black/30 transition p-3">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  {/* ブランドプレート */}
                  <div className="shrink-0 w-full md:w-[140px]">
                    <div className="rounded-xl bg-white/80 text-black font-black grid place-items-center h-[54px] md:h-[110px]">
                      {d.brand.toUpperCase()}
                    </div>
                  </div>

                  {/* サムネ */}
                  <div className="shrink-0 w-full md:w-[130px]">
                    <div className="rounded-xl bg-white/6 overflow-hidden ring-1 ring-white/10 w-full aspect-square md:w-[130px] md:h-[130px] grid place-items-center">
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
                  </div>

                  {/* 本文 */}
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-black text-white/95"
                      style={{
                        fontSize: 18,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {d.caption_final || d.vision || "（未入力）"}
                    </div>

                    <div className="mt-2 text-xs text-white/55">
                      {d.phase === "ready" ? "投稿待ち（READY）" : d.phase === "posted" ? "投稿済み" : "下書き"}
                    </div>
                  </div>

                  {/* 矢印 */}
                  <div className="shrink-0 text-white/35 text-xl md:text-2xl text-right">
                    →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}