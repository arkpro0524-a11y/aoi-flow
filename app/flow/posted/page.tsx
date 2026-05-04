// app/flow/posted/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/firebase";
import { useToast } from "@/components/ToastProvider";
import type { DraftOutcome, SellOutcomeStatus } from "@/lib/types/draft";

type Draft = {
  id: string;
  userId: string;
  brand: "vento" | "riva";
  phase: "draft" | "ready" | "posted";
  vision: string;
  caption_final: string;
  igCaption: string;
  xCaption: string;
  imageUrl?: string;
  outcome?: DraftOutcome;
  updatedAt?: any;
};

const UI = {
  headerTitlePx: 20,
  pagePad: 16,
  cardPad: 14,
  colGap: 14,
  brandW: 140,
  plateH: 110,
  brandPx: 20,
  thumbBox: 130,
  titlePx: 20,
};

function resolveListImageUrl(data: DocumentData): string | undefined {
  const compositeImageUrl =
    typeof data.compositeImageUrl === "string" ? data.compositeImageUrl.trim() : "";
  if (compositeImageUrl) return compositeImageUrl;

  const aiImageUrl = typeof data.aiImageUrl === "string" ? data.aiImageUrl.trim() : "";
  if (aiImageUrl) return aiImageUrl;

  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
  if (imageUrl) return imageUrl;

  return undefined;
}

function normalizeOutcomeStatus(v: unknown): SellOutcomeStatus {
  if (v === "posted") return "posted";
  if (v === "listed") return "listed";
  if (v === "sold") return "sold";
  if (v === "unsold") return "unsold";
  if (v === "stopped") return "stopped";
  return "unknown";
}

function toNumberOrUndefined(v: unknown): number | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;

  return Math.round(n);
}

function normalizeOutcome(data: any): DraftOutcome | undefined {
  if (!data || typeof data !== "object") return undefined;

  const out: DraftOutcome = {
    status: normalizeOutcomeStatus(data.status),
  };

  const listedPrice = toNumberOrUndefined(data.listedPrice);
  const soldPrice = toNumberOrUndefined(data.soldPrice);
  const views = toNumberOrUndefined(data.views);
  const likes = toNumberOrUndefined(data.likes);
  const listedAt = toNumberOrUndefined(data.listedAt);
  const soldAt = toNumberOrUndefined(data.soldAt);
  const updatedAt = toNumberOrUndefined(data.updatedAt);

  if (listedPrice !== undefined) out.listedPrice = listedPrice;
  if (soldPrice !== undefined) out.soldPrice = soldPrice;
  if (views !== undefined) out.views = views;
  if (likes !== undefined) out.likes = likes;
  if (listedAt !== undefined) out.listedAt = listedAt;
  if (soldAt !== undefined) out.soldAt = soldAt;
  if (updatedAt !== undefined) out.updatedAt = updatedAt;

  const platform = typeof data.platform === "string" ? data.platform.trim() : "";
  const memo = typeof data.memo === "string" ? data.memo.trim() : "";

  if (platform) out.platform = platform;
  if (memo) out.memo = memo;

  if (data.sellCheck && typeof data.sellCheck === "object") {
    out.sellCheck = data.sellCheck;
  }

  return out;
}

function yen(v?: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString()}円`;
}

function num(v?: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

function statusLabel(status: SellOutcomeStatus) {
  if (status === "posted") return "投稿";
  if (status === "listed") return "出品中";
  if (status === "sold") return "売却済み";
  if (status === "unsold") return "未売却";
  if (status === "stopped") return "停止";
  return "未入力";
}

function safeTitle(d: Draft) {
  return d.caption_final || d.igCaption || d.xCaption || d.vision || "（本文なし）";
}

function OutcomeEditor(props: {
  draft: Draft;
  uid: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const { draft, uid, onSaved, onError } = props;
  const current = draft.outcome;

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<SellOutcomeStatus>(current?.status ?? "unknown");
  const [listedPrice, setListedPrice] = useState(
    current?.listedPrice ? String(current.listedPrice) : ""
  );
  const [soldPrice, setSoldPrice] = useState(
    current?.soldPrice ? String(current.soldPrice) : ""
  );
  const [views, setViews] = useState(current?.views ? String(current.views) : "");
  const [likes, setLikes] = useState(current?.likes ? String(current.likes) : "");
  const [platform, setPlatform] = useState(current?.platform ?? "");
  const [memo, setMemo] = useState(current?.memo ?? "");

  useEffect(() => {
    setStatus(current?.status ?? "unknown");
    setListedPrice(current?.listedPrice ? String(current.listedPrice) : "");
    setSoldPrice(current?.soldPrice ? String(current.soldPrice) : "");
    setViews(current?.views ? String(current.views) : "");
    setLikes(current?.likes ? String(current.likes) : "");
    setPlatform(current?.platform ?? "");
    setMemo(current?.memo ?? "");
  }, [current, draft.id]);

  async function saveOutcome() {
    if (!uid) return;

    setSaving(true);

    try {
      const nextOutcome: DraftOutcome = {
        status,
        updatedAt: Date.now(),
      };

      const nextListedPrice = toNumberOrUndefined(listedPrice);
      const nextSoldPrice = toNumberOrUndefined(soldPrice);
      const nextViews = toNumberOrUndefined(views);
      const nextLikes = toNumberOrUndefined(likes);

      if (nextListedPrice !== undefined) nextOutcome.listedPrice = nextListedPrice;
      if (nextSoldPrice !== undefined) nextOutcome.soldPrice = nextSoldPrice;
      if (nextViews !== undefined) nextOutcome.views = nextViews;
      if (nextLikes !== undefined) nextOutcome.likes = nextLikes;

      const p = platform.trim();
      const m = memo.trim();

      if (p) nextOutcome.platform = p;
      if (m) nextOutcome.memo = m;

      if (status === "listed" && !current?.listedAt) {
        nextOutcome.listedAt = Date.now();
      } else if (current?.listedAt) {
        nextOutcome.listedAt = current.listedAt;
      }

      if (status === "sold" && !current?.soldAt) {
        nextOutcome.soldAt = Date.now();
      } else if (current?.soldAt) {
        nextOutcome.soldAt = current.soldAt;
      }

      if (current?.sellCheck) {
        nextOutcome.sellCheck = current.sellCheck;
      }

      await updateDoc(doc(db, "drafts", draft.id), {
        outcome: nextOutcome,
        updatedAt: serverTimestamp(),
      });

      onSaved();
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      onError(e?.message || "成果データの保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black text-white/70">成果記録</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/55">
            <span>状態：{statusLabel(current?.status ?? "unknown")}</span>
            <span>出品：{yen(current?.listedPrice)}</span>
            <span>売却：{yen(current?.soldPrice)}</span>
            <span>閲覧：{num(current?.views)}</span>
            <span>いいね：{num(current?.likes)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white"
        >
          {open ? "閉じる" : "成果を入力"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <label className="text-xs font-bold text-white/70">
              状態
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SellOutcomeStatus)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
              >
                <option value="unknown">未入力</option>
                <option value="posted">投稿</option>
                <option value="listed">出品中</option>
                <option value="sold">売却済み</option>
                <option value="unsold">未売却</option>
                <option value="stopped">停止</option>
              </select>
            </label>

            <label className="text-xs font-bold text-white/70">
              出品価格
              <input
                value={listedPrice}
                onChange={(e) => setListedPrice(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：2500"
              />
            </label>

            <label className="text-xs font-bold text-white/70">
              売却価格
              <input
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：2200"
              />
            </label>

            <label className="text-xs font-bold text-white/70">
              閲覧数
              <input
                value={views}
                onChange={(e) => setViews(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：120"
              />
            </label>

            <label className="text-xs font-bold text-white/70">
              いいね
              <input
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：5"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <label className="text-xs font-bold text-white/70">
              販売先
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：メルカリ"
              />
            </label>

            <label className="text-xs font-bold text-white/70">
              メモ
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-white outline-none"
                placeholder="例：閲覧は多いが反応弱い"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-white/45">
              ※ ここに入れた成果が、次の「売れる判断OS」の学習材料になります。
            </div>

            <button
              type="button"
              onClick={saveOutcome}
              disabled={saving}
              className="rounded-full bg-white px-5 py-2 text-xs font-black text-black disabled:opacity-50"
            >
              {saving ? "保存中..." : "成果を保存"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PostedPage() {
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
      where("phase", "==", "posted"),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: Draft[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as DocumentData;

          const igCaption =
            typeof data.igCaption === "string"
              ? data.igCaption
              : typeof data.ig === "string"
                ? data.ig
                : "";

          const xCaption =
            typeof data.xCaption === "string"
              ? data.xCaption
              : typeof data.x === "string"
                ? data.x
                : "";

          const captionFinal =
            typeof data.caption_final === "string"
              ? data.caption_final
              : igCaption || xCaption;

          return {
            id: docSnap.id,
            userId: typeof data.userId === "string" ? data.userId : uid,
            brand: data.brand === "riva" || data.brandId === "riva" ? "riva" : "vento",
            phase:
              data.phase === "ready"
                ? "ready"
                : data.phase === "posted"
                  ? "posted"
                  : "draft",
            vision: typeof data.vision === "string" ? data.vision : "",
            caption_final: captionFinal,
            igCaption,
            xCaption,
            imageUrl: resolveListImageUrl(data),
            outcome: normalizeOutcome(data.outcome),
            updatedAt: data.updatedAt,
          };
        });

        setRows(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
        toast.push("投稿済みの取得に失敗しました");
      }
    );

    return () => unsub();
  }, [uid, authLoading, toast]);

  const posted = useMemo(() => rows, [rows]);

  return (
    <>
      <style jsx>{`
        .postedCard {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.25);
          padding: ${UI.cardPad}px;
          transition: 0.15s ease;
        }

        .postedCard:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        .postedGrid {
          display: grid;
          grid-template-columns: ${UI.brandW}px ${UI.thumbBox}px 1fr 24px;
          gap: ${UI.colGap}px;
          align-items: center;
        }

        @media (max-width: 1023px) {
          .postedGrid {
            grid-template-columns: 1fr;
            align-items: stretch;
          }

          .postedArrow {
            display: none;
          }
        }
      `}</style>

      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-white/10" style={{ padding: UI.pagePad }}>
          <div style={{ fontSize: UI.headerTitlePx, fontWeight: 900 }}>投稿済み</div>

          {authLoading ? (
            <div className="mt-1 text-sm text-white/60">認証確認中...</div>
          ) : (
            <div className="mt-1 text-sm text-white/60">
              POSTEDのみ表示：{posted.length} 件{loading ? "（読み込み中...）" : ""}
            </div>
          )}
        </div>

        <div className="overflow-y-auto" style={{ padding: UI.pagePad }}>
          {authLoading ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              認証確認中...
            </div>
          ) : !uid ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              ログインしてください。
            </div>
          ) : posted.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              投稿済みがありません。「新規作成 → 投稿済みにする」で追加されます。
            </div>
          ) : (
            <div className="space-y-3">
              {posted.map((d) => (
                <div key={d.id} className="postedCard">
                  <Link
                    href={`/flow/drafts/new?id=${encodeURIComponent(d.id)}`}
                    className="block no-underline text-white/90 visited:text-white/90 hover:text-white"
                  >
                    <div className="postedGrid">
                      <div
                        className="flex items-center justify-center rounded-xl border border-black/25 bg-gradient-to-b from-[#f2f2f2] via-[#cfcfcf] to-[#9b9b9b] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-10px_22px_rgba(0,0,0,0.25),0_8px_18px_rgba(0,0,0,0.25)]"
                        style={{ height: UI.plateH }}
                      >
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
                        className="flex items-center justify-center overflow-hidden rounded-xl bg-white/6 ring-1 ring-white/10"
                        style={{
                          width: "100%",
                          maxWidth: UI.thumbBox,
                          height: UI.thumbBox,
                          position: "relative",
                        }}
                      >
                        {d.imageUrl ? (
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
                            fontSize: UI.titlePx,
                            fontWeight: 900,
                            lineHeight: 1.15,
                            color: "rgba(255,255,255,0.95)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {safeTitle(d)}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                          <span>投稿済み（POSTED）</span>
                          <span>状態：{statusLabel(d.outcome?.status ?? "unknown")}</span>
                        </div>
                      </div>

                      <div className="postedArrow text-xl text-white/35 transition group-hover:text-white/80">
                        →
                      </div>
                    </div>
                  </Link>

                  <div className="mt-3">
                    <OutcomeEditor
                      draft={d}
                      uid={uid}
                      onSaved={() => toast.push("成果データを保存しました")}
                      onError={(message) => toast.push(message)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}