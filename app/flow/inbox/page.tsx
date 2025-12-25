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

export default function InboxPage() {
  const toast = useToast();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 認証状態を state として確定させる（スマホでの不安定さを潰す）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ uid が確定してから Firestore を購読
  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "drafts"),
      where("userId", "==", uid),
      where("phase", "==", "ready"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Draft[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRows(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.push("投稿待ちの取得に失敗しました");
      }
    );

    return () => unsub();
  }, [uid, authLoading, toast]);

  const ready = useMemo(() => rows, [rows]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-white/10 p-5">
        <div style={{ fontSize: 28, fontWeight: 900 }}>投稿待ち</div>

        {authLoading ? (
          <div className="text-sm text-white/60 mt-1">認証確認中...</div>
        ) : (
          <div className="text-sm text-white/60 mt-1">
            READYのみ表示：{ready.length} 件{loading ? "（読み込み中...）" : ""}
          </div>
        )}
      </div>

      <div className="overflow-y-auto p-5 space-y-4">
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
              className="block rounded-3xl border border-white/10 bg-black/25 p-5 transition hover:bg-black/30"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/80">
                  <span className="font-black tracking-[0.22em]">{d.brand.toUpperCase()}</span>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/85 ring-1 ring-white/10">
                  投稿待ち
                </div>
              </div>

              <div className="mt-3 line-clamp-2 text-sm text-white/90">
                {d.caption_final || d.vision || "（本文なし）"}
              </div>

              {d.imageUrl && (
                <div className="mt-3 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.imageUrl} alt="img" className="h-40 w-full object-cover" />
                </div>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}