// /app/flow/brands/page.tsx
// 設定ページ。
// 既存のブランド作成・seed・編集・有効化機能を残したまま、画面だけを設定.pngのカード型レイアウトへ寄せます。

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";

type Brand = {
  id: string;
  name: string;
  isActive: boolean;
  captionPolicy: {
    voiceText: string;
    igGoal: string;
    xGoal: string;
    must: string[];
    ban: string[];
    toneDefault: string;
  };
  imagePolicy: {
    styleText: string;
    rules: string[];
    size?: "1024x1024";
  };
  updatedAt?: any;
  createdAt?: any;
};

function defaultsBase(name: string): Omit<Brand, "id"> {
  return {
    name,
    isActive: true,
    captionPolicy: {
      voiceText: "このブランドの思想（必須）。例：静かに誠実、押し売りしない、余白を残す。",
      igGoal: "IGの役割（例：納得して投稿できる本文）",
      xGoal: "Xの役割（例：短く注意→興味）",
      must: ["誠実"],
      ban: ["煽り", "過剰な断定", "大げさな広告口調"],
      toneDefault: "calm, honest, concise",
    },
    imagePolicy: {
      styleText: "quiet, minimal, premium, calm, no text",
      rules: ["no text", "no logos", "no watermark", "high quality", "centered composition"],
      size: "1024x1024",
    },
  };
}

function defaultsVento(): Omit<Brand, "id"> {
  const b = defaultsBase("VENTO");
  b.captionPolicy.voiceText = "ビンテージ/一点物・文脈・手仕事・静けさ。押し売りしない。誠実に、短く、余白を残す。";
  b.captionPolicy.must = ["誠実", "静か", "押し売りしない", "文脈を残す"];
  b.captionPolicy.ban = ["煽り", "過剰な断定", "大げさな広告口調", "理論名の説明"];
  b.imagePolicy.styleText = "quiet, airy, vintage object mood, minimal, premium, calm, no text";
  return b;
}

function defaultsRiva(): Omit<Brand, "id"> {
  const b = defaultsBase("RIVA");
  b.captionPolicy.voiceText = "クラシック/旧車・機械美・手触り・誠実。売り込み臭は避け、静かに格好良く。";
  b.captionPolicy.must = ["誠実", "静か", "機械美", "売り込み臭を消す"];
  b.captionPolicy.ban = ["煽り", "過剰な価格訴求", "理論名の説明", "誇張"];
  b.imagePolicy.styleText = "moody, cinematic, classic car / mechanical texture, minimal, premium, calm, no text";
  return b;
}

function splitLines(text: string) {
  return text.split(/\r?\n/g).map((s) => s.trim()).filter(Boolean);
}

function joinLines(arr: string[]) {
  return (arr ?? []).join("\n");
}

function allowName(name: string) {
  return String(name || "NO NAME");
}

function FieldLabel(props: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-black text-white/70">{props.children}</div>;
}

function GlassCard(props: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`settings-glass rounded-3xl p-5 ${props.className || ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">{props.title}</h2>
          {props.sub ? <p className="mt-1 text-xs leading-5 text-white/55">{props.sub}</p> : null}
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

export default function BrandsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const [newId, setNewId] = useState("client-brand-1");
  const [newName, setNewName] = useState("CLIENT BRAND 1");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Brand, "id"> | null>(null);
  const [saving, setSaving] = useState(false);

  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [openImage, setOpenImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "app" | "notice" | "data" | "security" | "system">("account");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  async function load() {
    if (!uid) return;
    setLoading(true);
    try {
      const qy = query(collection(db, `users/${uid}/brands`), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qy);
      const list: Brand[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!uid) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function seedVentoRiva() {
    if (!uid) return;
    const base = `users/${uid}/brands`;
    await setDoc(doc(db, `${base}/vento`), { ...defaultsVento(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, `${base}/riva`), { ...defaultsRiva(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await load();
    alert("vento / riva を作成しました");
  }

  async function createBrand() {
    if (!uid) return;

    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) {
      alert("brandId / name を入力してください");
      return;
    }

    await setDoc(doc(db, `users/${uid}/brands/${id}`), { ...defaultsBase(name), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await load();
    alert("ブランドを作成しました（次は編集して思想/目的/禁止を入れてください）");
  }

  async function toggleActive(b: Brand) {
    if (!uid) return;
    await updateDoc(doc(db, `users/${uid}/brands/${b.id}`), { isActive: !b.isActive, updatedAt: serverTimestamp() });
    await load();
  }

  async function startEdit(id: string) {
    if (!uid) return;
    const snap = await getDoc(doc(db, `users/${uid}/brands/${id}`));
    if (!snap.exists()) return;

    const data = snap.data() as any;
    const normalized: Omit<Brand, "id"> = {
      name: typeof data.name === "string" ? data.name : id,
      isActive: typeof data.isActive === "boolean" ? data.isActive : true,
      captionPolicy: {
        voiceText: String(data?.captionPolicy?.voiceText ?? ""),
        igGoal: String(data?.captionPolicy?.igGoal ?? ""),
        xGoal: String(data?.captionPolicy?.xGoal ?? ""),
        must: Array.isArray(data?.captionPolicy?.must) ? data.captionPolicy.must.map(String) : [],
        ban: Array.isArray(data?.captionPolicy?.ban) ? data.captionPolicy.ban.map(String) : [],
        toneDefault: String(data?.captionPolicy?.toneDefault ?? "calm, honest, concise"),
      },
      imagePolicy: {
        styleText: String(data?.imagePolicy?.styleText ?? ""),
        rules: Array.isArray(data?.imagePolicy?.rules) ? data.imagePolicy.rules.map(String) : [],
        size: "1024x1024",
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    setEditingId(id);
    setForm(normalized);
    setOpenAdvanced(false);
    setOpenImage(false);
  }

  async function saveEdit() {
    if (!uid || !editingId || !form) return;

    if (!form.captionPolicy.voiceText.trim()) {
      alert("思想（voiceText）が空です。ここが空だとAIに反映されません。");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, `users/${uid}/brands/${editingId}`), { ...form, updatedAt: serverTimestamp() }, { merge: true });
      setEditingId(null);
      setForm(null);
      await load();
      alert("保存しました（この内容がAI生成に反映されます）");
    } finally {
      setSaving(false);
    }
  }

  const map = useMemo(() => {
    const m: Record<string, Brand> = {};
    for (const r of rows) m[r.id] = r;
    return m;
  }, [rows]);

  if (!uid) return <div className="p-6 text-white/80">ログインしてください。</div>;

  return (
    <div className="space-y-5 text-white">
      <style>{`
        .settings-glass { border: 1px solid rgba(125,211,252,.12); background: linear-gradient(135deg, rgba(8,32,50,.72), rgba(7,22,36,.58)); box-shadow: 0 22px 70px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(18px); }
        .settings-input { width: 100%; border: 1px solid rgba(125,211,252,.14); background: rgba(5,18,31,.64); color: rgba(255,255,255,.9); border-radius: 14px; padding: 10px 12px; outline: none; }
        .settings-btn-blue { background: linear-gradient(135deg,#2563eb,#1d4ed8); border: 1px solid rgba(147,197,253,.28); color: white; box-shadow: 0 12px 34px rgba(37,99,235,.22); }
        .settings-pill { border: 1px solid rgba(125,211,252,.12); background: rgba(255,255,255,.055); }
      `}</style>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-wide">設定</h1>
          <p className="mt-2 text-sm text-white/65">アカウント設定・アプリ設定・システム設定を管理します</p>
        </div>
        <div className="flex w-full max-w-xl items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3">
          <input className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/38" placeholder="設定項目を検索してください" />
          <span className="text-white/45">⌕</span>
        </div>
      </div>

      <div className="flex flex-wrap overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {[
          ["account", "アカウント設定"],
          ["app", "アプリ設定"],
          ["notice", "通知設定"],
          ["data", "データ管理"],
          ["security", "セキュリティ設定"],
          ["system", "システム情報"],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key as any)} className={`min-w-[150px] flex-1 px-5 py-4 text-sm font-black transition ${activeTab === key ? "bg-blue-600/65 text-white" : "text-white/70 hover:bg-white/8"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <main className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <GlassCard title="プロフィール設定">
              <div className="flex gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white/85 text-3xl">👤</div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div><FieldLabel>名前</FieldLabel><input className="settings-input" value="Aoi Hanako" readOnly /></div>
                  <div><FieldLabel>メールアドレス</FieldLabel><div className="text-sm text-white/75">aoi@example.com</div></div>
                  <div className="flex items-center gap-2 text-sm"><span className="text-white/55">プラン</span><span className="rounded-full bg-blue-500/20 px-2 py-1 text-xs font-black text-blue-100">プレミアムプラン</span></div>
                </div>
              </div>
            </GlassCard>

            <GlassCard title="ブランド切り替え" sub="既存のブランドDBをそのまま使用します。">
              <div className="space-y-3">
                {loading ? <div className="text-sm text-white/60">読み込み中...</div> : rows.length === 0 ? <div className="text-sm text-white/60">まだブランドがありません。</div> : rows.slice(0, 4).map((b) => (
                  <div key={b.id} className={`flex items-center justify-between rounded-2xl border border-white/10 p-3 ${b.isActive ? "bg-blue-600/35" : "bg-white/5"}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{allowName(b.name)}</div>
                      <div className="mt-1 truncate text-xs text-white/55">{b.id} / 思想 {String(map?.[b.id]?.captionPolicy?.voiceText ?? "").trim() ? "✅" : "❌"}</div>
                    </div>
                    <button type="button" onClick={() => startEdit(b.id)} className="rounded-full bg-white/12 px-3 py-1 text-xs font-black">編集</button>
                  </div>
                ))}
                <button type="button" onClick={seedVentoRiva} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black">VENTO / RIVA を作成</button>
              </div>
            </GlassCard>

            <GlassCard title="基本設定">
              <div className="space-y-3">
                <div><FieldLabel>テーマ</FieldLabel><select className="settings-input" defaultValue="dark"><option value="dark">ダーク（AOI Blue）</option></select></div>
                <div><FieldLabel>表示言語</FieldLabel><select className="settings-input" defaultValue="ja"><option value="ja">日本語</option></select></div>
                <div><FieldLabel>1ページの表示件数</FieldLabel><select className="settings-input" defaultValue="20"><option value="20">20件</option><option value="50">50件</option></select></div>
                <button type="button" className="settings-btn-blue w-full rounded-2xl px-4 py-3 text-sm font-black">設定を保存</button>
              </div>
            </GlassCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <GlassCard title="API連携設定">
              <div className="space-y-3 text-sm">
                {["OpenAI", "Runway", "Cloud Render", "Firebase", "Gemini"].map((name, i) => (
                  <div key={name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span>{name}</span><span className={`rounded-full px-2 py-1 text-xs font-black ${i < 4 ? "bg-emerald-500/15 text-emerald-100" : "bg-white/10 text-white/60"}`}>{i < 4 ? "接続済み" : "未接続"}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard title="通知設定">
              <div className="space-y-3 text-sm">
                {["メール通知", "アプリ内通知", "レポート通知", "診断完了通知"].map((name) => (
                  <div key={name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3"><span>{name}</span><span className="rounded-full bg-blue-500 px-4 py-2 text-xs font-black">ON</span></div>
                ))}
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3"><span>システムメンテナンス通知</span><span className="rounded-full bg-white/20 px-4 py-2 text-xs font-black">OFF</span></div>
              </div>
            </GlassCard>

            <GlassCard title="データ管理">
              <div className="space-y-3 text-sm">
                <a href="/flow/library" className="block rounded-2xl border border-white/10 bg-white/5 p-3 text-white no-underline">データのバックアップ</a>
                <a href="/flow/market-research" className="block rounded-2xl border border-white/10 bg-white/5 p-3 text-white no-underline">データのエクスポート</a>
                <button type="button" onClick={() => window.location.reload()} className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-white">キャッシュのクリア</button>
              </div>
            </GlassCard>
          </div>

          <GlassCard title="ブランド作成・編集" sub="ここが既存機能です。削除せず、設定画面の下部に整理して残しています。">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="font-black">新規ブランド作成</h3>
                <div className="mt-3 space-y-3">
                  <div><FieldLabel>brandId</FieldLabel><input className="settings-input" value={newId} onChange={(e) => setNewId(e.target.value)} /></div>
                  <div><FieldLabel>表示名</FieldLabel><input className="settings-input" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
                  <button type="button" onClick={createBrand} className="settings-btn-blue rounded-2xl px-4 py-3 text-sm font-black">作成</button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="font-black">一覧</h3>
                <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                  {rows.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="min-w-0"><div className="truncate text-sm font-black">{allowName(b.name)}</div><div className="text-xs text-white/50">{b.isActive ? "ACTIVE" : "INACTIVE"}</div></div>
                      <div className="flex shrink-0 gap-2"><button onClick={() => startEdit(b.id)} className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">編集</button><button onClick={() => toggleActive(b)} className="rounded-full bg-white/12 px-3 py-1 text-xs font-black">{b.isActive ? "無効化" : "有効化"}</button></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {editingId && form ? (
            <GlassCard title={`編集：${editingId}`}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div><FieldLabel>表示名</FieldLabel><input className="settings-input" value={form.name} onChange={(e) => setForm((p) => p ? { ...p, name: e.target.value } : p)} /></div>
                  <div><FieldLabel>思想（voiceText）※必須</FieldLabel><textarea className="settings-input min-h-32" value={form.captionPolicy.voiceText} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, voiceText: e.target.value } } : p)} /></div>
                  <div><FieldLabel>IGの目的</FieldLabel><textarea className="settings-input min-h-24" value={form.captionPolicy.igGoal} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, igGoal: e.target.value } } : p)} /></div>
                  <div><FieldLabel>Xの目的</FieldLabel><textarea className="settings-input min-h-24" value={form.captionPolicy.xGoal} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, xGoal: e.target.value } } : p)} /></div>
                </div>
                <div className="space-y-3">
                  <button type="button" onClick={() => setOpenAdvanced((v) => !v)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black">文章詳細設定を{openAdvanced ? "閉じる" : "開く"}</button>
                  {openAdvanced ? <div className="space-y-3"><div><FieldLabel>must（1行1項目）</FieldLabel><textarea className="settings-input min-h-24" value={joinLines(form.captionPolicy.must)} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, must: splitLines(e.target.value) } } : p)} /></div><div><FieldLabel>ban（1行1項目）</FieldLabel><textarea className="settings-input min-h-24" value={joinLines(form.captionPolicy.ban)} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, ban: splitLines(e.target.value) } } : p)} /></div><div><FieldLabel>toneDefault</FieldLabel><input className="settings-input" value={form.captionPolicy.toneDefault} onChange={(e) => setForm((p) => p ? { ...p, captionPolicy: { ...p.captionPolicy, toneDefault: e.target.value } } : p)} /></div></div> : null}
                  <button type="button" onClick={() => setOpenImage((v) => !v)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black">画像設定を{openImage ? "閉じる" : "開く"}</button>
                  {openImage ? <div className="space-y-3"><div><FieldLabel>styleText</FieldLabel><textarea className="settings-input min-h-24" value={form.imagePolicy.styleText} onChange={(e) => setForm((p) => p ? { ...p, imagePolicy: { ...p.imagePolicy, styleText: e.target.value } } : p)} /></div><div><FieldLabel>rules（1行1項目）</FieldLabel><textarea className="settings-input min-h-24" value={joinLines(form.imagePolicy.rules)} onChange={(e) => setForm((p) => p ? { ...p, imagePolicy: { ...p.imagePolicy, rules: splitLines(e.target.value), size: "1024x1024" } } : p)} /></div></div> : null}
                  <div className="flex gap-2"><button type="button" disabled={saving} onClick={saveEdit} className="settings-btn-blue rounded-2xl px-5 py-3 text-sm font-black disabled:opacity-50">保存</button><button type="button" onClick={() => { setEditingId(null); setForm(null); }} className="rounded-2xl border border-white/10 bg-white/8 px-5 py-3 text-sm font-black">キャンセル</button></div>
                </div>
              </div>
            </GlassCard>
          ) : null}

          <GlassCard title="高度な設定">
            <div className="grid gap-4 md:grid-cols-5 text-sm text-white/70">
              <div>AIモデル設定<br /><span className="text-xs text-white/45">使用するAIモデルの設定</span></div>
              <div>分析アルゴリズム設定<br /><span className="text-xs text-white/45">分析・診断のアルゴリズム設定</span></div>
              <div>画像処理設定<br /><span className="text-xs text-white/45">画像生成・編集の詳細設定</span></div>
              <div>自動化設定<br /><span className="text-xs text-white/45">ワークフローの自動化設定</span></div>
              <div>外部連携設定<br /><span className="text-xs text-white/45">外部サービスとの連携設定</span></div>
            </div>
          </GlassCard>
        </main>

        <aside className="space-y-4">
          <GlassCard title="プラン情報">
            <div className="space-y-3 text-sm text-white/70"><div className="font-black text-yellow-100">♕ プレミアムプラン</div><div className="flex justify-between"><span>利用期間</span><b>2025/07/01まで</b></div><div className="h-2 rounded-full bg-white/10"><div className="h-2 w-[78%] rounded-full bg-blue-500" /></div></div>
          </GlassCard>
          <GlassCard title="システム情報">
            <div className="space-y-3 text-sm text-white/70"><div className="flex justify-between"><span>バージョン</span><b>v2.4.1</b></div><div className="flex justify-between"><span>環境</span><b className="text-emerald-200">本番環境</b></div><div className="flex justify-between"><span>システム状態</span><b className="text-emerald-200">正常</b></div></div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
