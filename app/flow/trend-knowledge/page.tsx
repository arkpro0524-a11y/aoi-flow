// app/flow/trend-knowledge/page.tsx
// TREND KNOWLEDGE画面。
// 市場カードを保存・編集・一覧表示し、市場ごとの調査先・検索ワード・観測項目を確認できます。

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import type { MarketCard, MarketStatus } from "@/lib/vento/marketResearch";

type EditableCard = MarketCard & { id?: string };

const emptyCard: EditableCard = {
  marketName: "",
  domesticDemand: "未確認",
  overseasDemand: "未確認",
  researchSources: [],
  searchWords: [],
  observationItems: [],
  hypothesis: "",
  theory: "",
  evidence: [],
  missingInfo: [],
  status: "researching",
  updatedAt: "",
};

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]): string {
  return (value || []).filter(Boolean).join("\n");
}

function statusLabel(status: string): string {
  if (status === "validated") return "検証済";
  if (status === "pass") return "見送り";
  if (status === "watch") return "監視";
  return "調査中";
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="mb-4">
        <div className="text-lg font-black tracking-[0.08em] text-white">{props.title}</div>
        {props.subtitle ? <div className="mt-1 text-sm leading-6 text-white/58">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </section>
  );
}

function SmallList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-black tracking-[0.12em] text-white/45">{title}</div>
      <div className="mt-2 space-y-1 text-sm leading-6 text-white/72">
        {items.length > 0 ? items.slice(0, 8).map((item, index) => <div key={`${item}-${index}`}>・{item}</div>) : <div className="text-white/38">未入力</div>}
      </div>
    </div>
  );
}

export default function TrendKnowledgePage() {
  const [user, setUser] = useState<User | null>(null);
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [editing, setEditing] = useState<EditableCard>(emptyCard);
  const [researchSourcesText, setResearchSourcesText] = useState("");
  const [searchWordsText, setSearchWordsText] = useState("");
  const [observationItemsText, setObservationItemsText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [missingInfoText, setMissingInfoText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser ?? null));
    return () => unsub();
  }, []);

  const canSave = useMemo(() => editing.marketName.trim().length > 0 && Boolean(user), [editing.marketName, user]);

  async function authedFetch(url: string, init?: RequestInit) {
    if (!auth.currentUser) throw new Error("ログイン状態が確認できません。再ログインしてください。");
    const token = await auth.currentUser.getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  }

  async function loadCards() {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch("/api/market-cards");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "市場カード取得に失敗しました。");
      setCards(Array.isArray(json.cards) ? json.cards : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "市場カード取得に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user) void loadCards();
  }, [user]);

  function startEdit(card: EditableCard) {
    setEditing(card);
    setResearchSourcesText(arrayToLines(card.researchSources));
    setSearchWordsText(arrayToLines(card.searchWords));
    setObservationItemsText(arrayToLines(card.observationItems));
    setEvidenceText(arrayToLines(card.evidence));
    setMissingInfoText(arrayToLines(card.missingInfo));
    setMessage("");
    setError("");
  }

  function resetForm() {
    startEdit(emptyCard);
  }

  function buildPayload(): EditableCard {
    return {
      ...editing,
      researchSources: linesToArray(researchSourcesText),
      searchWords: linesToArray(searchWordsText),
      observationItems: linesToArray(observationItemsText),
      evidence: linesToArray(evidenceText),
      missingInfo: linesToArray(missingInfoText),
      updatedAt: new Date().toISOString(),
    };
  }

  async function saveCard() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPayload();
      const res = await authedFetch("/api/market-cards", {
        method: payload.id ? "PUT" : "POST",
        body: JSON.stringify(payload.id ? { id: payload.id, card: payload } : { card: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "保存に失敗しました。");
      setMessage(payload.id ? "市場カードを更新しました。" : "市場カードを保存しました。");
      await loadCards();
      if (!payload.id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCard(id: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await authedFetch("/api/market-cards", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "削除に失敗しました。");
      setMessage("市場カードを削除しました。削除はTREND KNOWLEDGEカードのみで、既存SELL CHECK等には影響しません。");
      await loadCards();
      if (editing.id === id) resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/25 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-cyan-100/60">AOI FLOW / TREND KNOWLEDGE</div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.1em] text-white md:text-4xl">市場カード管理</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/70">
          市場ごとに「次に見るべき調査先」「検索ワード」「観測項目」を保存・編集・一覧表示します。
          これは既存機能の置き換えではなく、市場研究レイヤーの追加です。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/flow/market-research" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">市場研究へ</Link>
          <Link href="/flow/product-selector" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">PRODUCT SELECTORへ</Link>
          <Link href="/flow/sell-check" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">SELL CHECKへ</Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[430px_1fr]">
        <Section title={editing.id ? "市場カード編集" : "市場カード新規保存"} subtitle="保存項目：marketName / domesticDemand / overseasDemand / researchSources / searchWords / observationItems / hypothesis / theory / evidence / missingInfo / status / updatedAt">
          <div className="space-y-3">
            <input value={editing.marketName} onChange={(e) => setEditing({ ...editing, marketName: e.target.value })} placeholder="marketName" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <div className="grid grid-cols-2 gap-3">
              <input value={String(editing.domesticDemand)} onChange={(e) => setEditing({ ...editing, domesticDemand: e.target.value })} placeholder="domesticDemand" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
              <input value={String(editing.overseasDemand)} onChange={(e) => setEditing({ ...editing, overseasDemand: e.target.value })} placeholder="overseasDemand" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            </div>
            <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as MarketStatus })} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none">
              <option value="researching">調査中</option>
              <option value="watch">監視</option>
              <option value="validated">検証済</option>
              <option value="pass">見送り</option>
            </select>
            <textarea value={researchSourcesText} onChange={(e) => setResearchSourcesText(e.target.value)} rows={4} placeholder="researchSources：1行1調査先" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={searchWordsText} onChange={(e) => setSearchWordsText(e.target.value)} rows={4} placeholder="searchWords：1行1検索ワード" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={observationItemsText} onChange={(e) => setObservationItemsText(e.target.value)} rows={4} placeholder="observationItems：1行1観測項目" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={editing.hypothesis} onChange={(e) => setEditing({ ...editing, hypothesis: e.target.value })} rows={3} placeholder="hypothesis" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={editing.theory} onChange={(e) => setEditing({ ...editing, theory: e.target.value })} rows={3} placeholder="theory" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} rows={3} placeholder="evidence：1行1根拠" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <textarea value={missingInfoText} onChange={(e) => setMissingInfoText(e.target.value)} rows={3} placeholder="missingInfo：1行1不足情報" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/35" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={saveCard} disabled={!canSave || busy} className="rounded-2xl bg-cyan-200 px-4 py-3 text-sm font-black text-[#0f1e30] disabled:opacity-50">保存</button>
              <button type="button" onClick={resetForm} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white">新規に戻す</button>
            </div>
            {message ? <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">{message}</div> : null}
            {error ? <div className="rounded-2xl border border-rose-300/35 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{error}</div> : null}
          </div>
        </Section>

        <Section title="市場カード一覧" subtitle="保存済みカードを選ぶと左側で編集できます。">
          <div className="space-y-4">
            {cards.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/62">市場カードはまだありません。市場研究画面で分析するか、左のフォームから保存してください。</div> : null}
            {cards.map((card) => (
              <article key={card.id || card.marketName} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs font-black tracking-[0.18em] text-cyan-100/55">{statusLabel(card.status)}</div>
                    <h2 className="mt-1 text-xl font-black text-white">{card.marketName}</h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-white/68">
                      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">国内：{card.domesticDemand}</span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">海外：{card.overseasDemand}</span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">更新：{card.updatedAt ? card.updatedAt.slice(0, 10) : "未記録"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(card)} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white">編集</button>
                    {card.id ? <button type="button" onClick={() => deleteCard(card.id || "")} className="rounded-full border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-100">削除</button> : null}
                  </div>
                </div>
                <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/72">{card.theory || "理論未入力"}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <SmallList title="次に見るべき調査先" items={card.researchSources || []} />
                  <SmallList title="検索ワード" items={card.searchWords || []} />
                  <SmallList title="観測項目" items={card.observationItems || []} />
                </div>

                <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-4">
                  <div className="text-xs font-black tracking-[0.16em] text-cyan-100/70">この市場カードからの次の指示</div>
                  <div className="mt-2 text-sm leading-7 text-white/78">
                    1. 「検索ワード」で調査先を検索する → 2. スクショ・本文を集める → 3. 市場研究へ戻って再分析する → 4. 理論が固まったら商品探索へ進む。
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Link
                      href={`/flow/market-research?market=${encodeURIComponent(card.marketName)}&keywords=${encodeURIComponent((card.searchWords || []).join(" "))}`}
                      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-xs font-black text-white no-underline"
                    >
                      観測スクショを追加して再分析
                    </Link>
                    <Link
                      href={`/flow/product-selector?market=${encodeURIComponent(card.marketName)}&keywords=${encodeURIComponent((card.searchWords || []).join(" "))}`}
                      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-xs font-black text-white no-underline"
                    >
                      この市場で商品探索
                    </Link>
                    <Link
                      href={`/flow/sell-check?source=trend-knowledge&title=${encodeURIComponent(card.marketName)}&keywords=${encodeURIComponent((card.searchWords || []).join(" "))}&memo=${encodeURIComponent(card.theory || card.hypothesis || "市場カードからSELL CHECKへ接続")}`}
                      className="rounded-full bg-white px-4 py-2 text-center text-xs font-black text-black no-underline"
                    >
                      最後にSELL CHECKへ
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
