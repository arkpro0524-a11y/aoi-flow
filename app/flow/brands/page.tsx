// /app/flow/brands/page.tsx
// 設定ページ。
// 指示内容：
// 1. アカウント設定に、名前・メールアドレス・プラン情報・プラン切り替え・利用期間・退会ボタンを実装。
// 2. アプリ設定に、ブランド一覧・ブランド詳細ポップアップ・ブランド作成/編集の既存機能を保持。
// 3. 通知設定 / データ管理 / セキュリティ設定 / システム情報 / 基本設定 / テーマ / 表示言語 / 表示件数 / AI連携設定は表示から削除。
// 4. 既存の users/{uid}/brands の保存形式を壊さず、過去コードの concept / tone / forbidden も復元して保存可能にする。

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";

type PlanType = "free" | "standard" | "premium";

type UserAccountSettings = {
  displayName: string;
  email: string;
  plan: PlanType;
  servicePeriodEnd: string;
  autoRenew: boolean;
  cancelRequested: boolean;
  cancelRequestedAt?: unknown;
  updatedAt?: unknown;
};

type Brand = {
  id: string;
  name: string;
  isActive: boolean;
  // 過去コードから復元したブランド思想系の入力項目。
  concept?: string;
  tone?: string;
  forbidden?: string;
  axisMode?: string;
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
  updatedAt?: unknown;
  createdAt?: unknown;
};

function defaultsBase(name: string): Omit<Brand, "id"> {
  return {
    name,
    isActive: true,
    concept: "",
    tone: "静 / 誠実 / ミニマル",
    forbidden: "断定、誇張、根拠のない実績、過剰な広告表現",
    axisMode: "core",
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
  b.concept = "ビンテージ・一点物・文脈・手仕事を、静かに誠実に届ける。";
  b.tone = "静か / 誠実 / 余白 / 押し売りしない";
  b.forbidden = "煽り、過剰な断定、大げさな広告口調、理論名の説明";
  b.captionPolicy.voiceText = "ビンテージ/一点物・文脈・手仕事・静けさ。押し売りしない。誠実に、短く、余白を残す。";
  b.captionPolicy.must = ["誠実", "静か", "押し売りしない", "文脈を残す"];
  b.captionPolicy.ban = ["煽り", "過剰な断定", "大げさな広告口調", "理論名の説明"];
  b.imagePolicy.styleText = "quiet, airy, vintage object mood, minimal, premium, calm, no text";
  return b;
}

function defaultsRiva(): Omit<Brand, "id"> {
  const b = defaultsBase("RIVA");
  b.concept = "クラシックカー・旧車の機械美と手触りを、誠実に静かに伝える。";
  b.tone = "静か / 格好良い / 機械美 / 売り込み臭を消す";
  b.forbidden = "煽り、過剰な価格訴求、理論名の説明、誇張";
  b.captionPolicy.voiceText = "クラシック/旧車・機械美・手触り・誠実。売り込み臭は避け、静かに格好良く。";
  b.captionPolicy.must = ["誠実", "静か", "機械美", "売り込み臭を消す"];
  b.captionPolicy.ban = ["煽り", "過剰な価格訴求", "理論名の説明", "誇張"];
  b.imagePolicy.styleText = "moody, cinematic, classic car / mechanical texture, minimal, premium, calm, no text";
  return b;
}

function splitLines(text: string) {
  return text
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinLines(arr: string[]) {
  return (arr ?? []).join("\n");
}

function safeText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value : fallback;
  return text.trim() ? text : fallback;
}

function allowName(name: string) {
  return String(name || "NO NAME");
}

function formatDateText(value: unknown) {
  if (!value) return "未設定";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    const d = (value as any).toDate() as Date;
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }
  return "保存済み";
}

function planLabel(plan: PlanType) {
  if (plan === "premium") return "プレミアムプラン";
  if (plan === "standard") return "スタンダードプラン";
  return "無料プラン";
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

function normalizeBrand(id: string, data: any): Brand {
  return {
    id,
    name: typeof data?.name === "string" ? data.name : id,
    isActive: typeof data?.isActive === "boolean" ? data.isActive : true,
    concept: typeof data?.concept === "string" ? data.concept : "",
    tone: typeof data?.tone === "string" ? data.tone : "静 / 誠実 / ミニマル",
    forbidden: typeof data?.forbidden === "string" ? data.forbidden : "断定、誇張、根拠のない実績、過剰な広告表現",
    axisMode: typeof data?.axisMode === "string" ? data.axisMode : "core",
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
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

export default function BrandsPage() {
  const [user, setUser] = useState<User | null>(null);
  const uid = user?.uid ?? null;

  const [rows, setRows] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const [account, setAccount] = useState<UserAccountSettings>({
    displayName: "",
    email: "",
    plan: "premium",
    servicePeriodEnd: "2025/07/01",
    autoRenew: true,
    cancelRequested: false,
  });
  const [accountSaving, setAccountSaving] = useState(false);

  const [newId, setNewId] = useState("client-brand-1");
  const [newName, setNewName] = useState("CLIENT BRAND 1");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Brand, "id"> | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailBrand, setDetailBrand] = useState<Brand | null>(null);
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [openImage, setOpenImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "app">("account");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function loadAccount(targetUser: User) {
    const ref = doc(db, `users/${targetUser.uid}/settings/account`);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as Partial<UserAccountSettings>) : {};

    setAccount({
      displayName: safeText(existing.displayName, targetUser.displayName || "Aoi Hanako"),
      email: safeText(existing.email, targetUser.email || ""),
      plan: existing.plan === "free" || existing.plan === "standard" || existing.plan === "premium" ? existing.plan : "premium",
      servicePeriodEnd: safeText(existing.servicePeriodEnd, "2025/07/01"),
      autoRenew: typeof existing.autoRenew === "boolean" ? existing.autoRenew : true,
      cancelRequested: typeof existing.cancelRequested === "boolean" ? existing.cancelRequested : false,
      cancelRequestedAt: existing.cancelRequestedAt,
      updatedAt: existing.updatedAt,
    });
  }

  async function loadBrands() {
    if (!uid) return;
    setLoading(true);
    try {
      const qy = query(collection(db, `users/${uid}/brands`), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qy);
      const list: Brand[] = snap.docs.map((d) => normalizeBrand(d.id, d.data()));
      setRows(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void loadAccount(user);
    void loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  async function saveAccount() {
    if (!uid) return;
    const payload: UserAccountSettings = {
      displayName: safeText(account.displayName, user?.displayName || "Aoi Hanako"),
      email: safeText(account.email, user?.email || ""),
      plan: account.plan,
      servicePeriodEnd: safeText(account.servicePeriodEnd, "2025/07/01"),
      autoRenew: Boolean(account.autoRenew),
      cancelRequested: Boolean(account.cancelRequested),
      updatedAt: serverTimestamp(),
    };

    setAccountSaving(true);
    try {
      await setDoc(doc(db, `users/${uid}/settings/account`), payload, { merge: true });
      setAccount(payload);
      alert("アカウント設定を保存しました");
    } finally {
      setAccountSaving(false);
    }
  }

  async function requestCancelAccount() {
    if (!uid) return;
    const ok = window.confirm("退会申請を保存します。利用期間終了までは利用可能です。よろしいですか？");
    if (!ok) return;

    const payload: UserAccountSettings = {
      displayName: safeText(account.displayName, user?.displayName || "Aoi Hanako"),
      email: safeText(account.email, user?.email || ""),
      plan: account.plan,
      servicePeriodEnd: safeText(account.servicePeriodEnd, "2025/07/01"),
      autoRenew: false,
      cancelRequested: true,
      cancelRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, `users/${uid}/settings/account`), payload, { merge: true });
    setAccount((p) => ({ ...p, autoRenew: false, cancelRequested: true }));
    alert("退会申請を保存しました。自動更新は停止として記録されます。");
  }

  async function seedVentoRiva() {
    if (!uid) return;
    const base = `users/${uid}/brands`;
    await setDoc(doc(db, `${base}/vento`), { ...defaultsVento(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, `${base}/riva`), { ...defaultsRiva(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await loadBrands();
    alert("VENTO / RIVA を作成しました");
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
    await loadBrands();
    alert("ブランドを作成しました。次に編集から詳細を入力してください。");
  }

  async function toggleActive(b: Brand) {
    if (!uid) return;
    await updateDoc(doc(db, `users/${uid}/brands/${b.id}`), { isActive: !b.isActive, updatedAt: serverTimestamp() });
    await loadBrands();
  }

  async function startEdit(id: string) {
    if (!uid) return;
    const snap = await getDoc(doc(db, `users/${uid}/brands/${id}`));
    if (!snap.exists()) return;

    const normalized = normalizeBrand(id, snap.data());
    const formPayload: Omit<Brand, "id"> = {
      name: normalized.name,
      isActive: normalized.isActive,
      concept: normalized.concept || "",
      tone: normalized.tone || "静 / 誠実 / ミニマル",
      forbidden: normalized.forbidden || "断定、誇張、根拠のない実績、過剰な広告表現",
      axisMode: normalized.axisMode || "core",
      captionPolicy: normalized.captionPolicy,
      imagePolicy: normalized.imagePolicy,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };

    setEditingId(id);
    setForm(formPayload);
    setOpenAdvanced(false);
    setOpenImage(false);
    setActiveTab("app");
  }

  async function saveEdit() {
    if (!uid || !editingId || !form) return;

    if (!form.name.trim()) {
      alert("表示名が空です。");
      return;
    }
    if (!form.captionPolicy.voiceText.trim()) {
      alert("思想（voiceText）が空です。ここが空だとAIに反映されません。");
      return;
    }

    const payload: Omit<Brand, "id"> = {
      name: form.name.trim(),
      isActive: Boolean(form.isActive),
      concept: String(form.concept || "").trim(),
      tone: String(form.tone || "").trim(),
      forbidden: String(form.forbidden || "").trim(),
      axisMode: String(form.axisMode || "core").trim(),
      captionPolicy: {
        voiceText: form.captionPolicy.voiceText.trim(),
        igGoal: form.captionPolicy.igGoal.trim(),
        xGoal: form.captionPolicy.xGoal.trim(),
        must: Array.isArray(form.captionPolicy.must) ? form.captionPolicy.must.map(String).filter(Boolean) : [],
        ban: Array.isArray(form.captionPolicy.ban) ? form.captionPolicy.ban.map(String).filter(Boolean) : [],
        toneDefault: form.captionPolicy.toneDefault.trim() || "calm, honest, concise",
      },
      imagePolicy: {
        styleText: form.imagePolicy.styleText.trim(),
        rules: Array.isArray(form.imagePolicy.rules) ? form.imagePolicy.rules.map(String).filter(Boolean) : [],
        size: "1024x1024",
      },
      createdAt: form.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      await setDoc(doc(db, `users/${uid}/brands/${editingId}`), payload, { merge: true });
      setEditingId(null);
      setForm(null);
      await loadBrands();
      alert("ブランド設定を保存しました");
    } finally {
      setSaving(false);
    }
  }

  const activeBrands = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  if (!uid) return <div className="p-6 text-white/80">ログインしてください。</div>;

  return (
    <div className="space-y-5 text-white">
      <style>{`
        .settings-glass { border: 1px solid rgba(125,211,252,.12); background: linear-gradient(135deg, rgba(8,32,50,.72), rgba(7,22,36,.58)); box-shadow: 0 22px 70px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(18px); }
        .settings-input { width: 100%; border: 1px solid rgba(125,211,252,.14); background: rgba(5,18,31,.64); color: rgba(255,255,255,.9); border-radius: 14px; padding: 10px 12px; outline: none; }
        .settings-input:focus { border-color: rgba(96,165,250,.55); box-shadow: 0 0 0 3px rgba(37,99,235,.18); }
        .settings-btn-blue { background: linear-gradient(135deg,#2563eb,#1d4ed8); border: 1px solid rgba(147,197,253,.28); color: white; box-shadow: 0 12px 34px rgba(37,99,235,.22); }
        .settings-btn-danger { background: linear-gradient(135deg,rgba(225,29,72,.9),rgba(127,29,29,.86)); border: 1px solid rgba(254,205,211,.25); color: white; }
      `}</style>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-wide">設定</h1>
          <p className="mt-2 text-sm text-white/65">アカウント設定とアプリ設定だけを管理します</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab("account")} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === "account" ? "settings-btn-blue" : "border border-white/10 bg-white/5 text-white/72"}`}>アカウント設定</button>
          <button type="button" onClick={() => setActiveTab("app")} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === "app" ? "settings-btn-blue" : "border border-white/10 bg-white/5 text-white/72"}`}>アプリ設定</button>
        </div>
      </div>

      {activeTab === "account" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <main className="space-y-5">
            <GlassCard title="アカウント設定" sub="名前・メールアドレス・プラン・利用期間・自動更新を保存します。">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <FieldLabel>名前</FieldLabel>
                  <input className="settings-input" value={account.displayName} onChange={(e) => setAccount((p) => ({ ...p, displayName: e.target.value }))} />
                </div>
                <div>
                  <FieldLabel>メールアドレス</FieldLabel>
                  <input className="settings-input" value={account.email} onChange={(e) => setAccount((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <FieldLabel>プラン情報</FieldLabel>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xl font-black">{planLabel(account.plan)}</div>
                    <div className="mt-1 text-sm text-white/55">現在の契約プラン</div>
                  </div>
                </div>
                <div>
                  <FieldLabel>プランの切り替え</FieldLabel>
                  <select className="settings-input" value={account.plan} onChange={(e) => setAccount((p) => ({ ...p, plan: e.target.value as PlanType }))}>
                    <option value="free">無料プラン</option>
                    <option value="standard">スタンダードプラン</option>
                    <option value="premium">プレミアムプラン</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>利用期間</FieldLabel>
                  <input className="settings-input" value={account.servicePeriodEnd} onChange={(e) => setAccount((p) => ({ ...p, servicePeriodEnd: e.target.value }))} placeholder="例：2025/07/01" />
                  <p className="mt-2 text-xs text-white/50">退会がない場合は自動更新されます。</p>
                </div>
                <div>
                  <FieldLabel>自動更新</FieldLabel>
                  <button type="button" onClick={() => setAccount((p) => ({ ...p, autoRenew: !p.autoRenew }))} className={`w-full rounded-2xl px-4 py-3 text-sm font-black ${account.autoRenew ? "bg-emerald-500/25 text-emerald-100" : "bg-rose-500/20 text-rose-100"}`}>
                    {account.autoRenew ? "自動更新：ON" : "自動更新：OFF"}
                  </button>
                  {account.cancelRequested ? <p className="mt-2 text-xs text-rose-100">退会申請済み：{formatDateText(account.cancelRequestedAt)}</p> : null}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={accountSaving} onClick={saveAccount} className="settings-btn-blue rounded-2xl px-6 py-3 text-sm font-black disabled:opacity-50">{accountSaving ? "保存中…" : "アカウント設定を保存"}</button>
                <button type="button" onClick={requestCancelAccount} className="settings-btn-danger rounded-2xl px-6 py-3 text-sm font-black">退会ボタン</button>
              </div>
            </GlassCard>
          </main>

          <aside className="space-y-5">
            <GlassCard title="契約状態">
              <div className="space-y-3 text-sm text-white/72">
                <div className="flex justify-between gap-3"><span>名前</span><b>{account.displayName || "未設定"}</b></div>
                <div className="flex justify-between gap-3"><span>プラン</span><b>{planLabel(account.plan)}</b></div>
                <div className="flex justify-between gap-3"><span>利用期間</span><b>{account.servicePeriodEnd || "未設定"}</b></div>
                <div className="flex justify-between gap-3"><span>自動更新</span><b className={account.autoRenew ? "text-emerald-200" : "text-rose-200"}>{account.autoRenew ? "ON" : "OFF"}</b></div>
              </div>
            </GlassCard>
          </aside>
        </div>
      ) : null}

      {activeTab === "app" ? (
        <div className="space-y-5">
          <GlassCard title="ブランド一覧" sub="現在のブランド切り替えを名称変更しました。詳細ボタンで設定内容をポップアップ表示します。">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-white/55">登録ブランド</div>
                <div className="mt-1 text-3xl font-black">{rows.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-white/55">有効ブランド</div>
                <div className="mt-1 text-3xl font-black">{activeBrands}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-white/55">AI反映</div>
                <div className="mt-1 text-3xl font-black">{rows.filter((r) => r.captionPolicy.voiceText.trim()).length}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? <div className="text-sm text-white/60">読み込み中...</div> : null}
              {!loading && rows.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">まだブランドがありません。</div> : null}
              {rows.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black">{allowName(b.name)}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${b.isActive ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/55"}`}>{b.isActive ? "ACTIVE" : "INACTIVE"}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/50">{b.id} / 思想：{b.captionPolicy.voiceText.trim() ? "入力済み" : "未入力"} / 更新：{formatDateText(b.updatedAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setDetailBrand(b)} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black">詳細</button>
                    <button type="button" onClick={() => startEdit(b.id)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">編集</button>
                    <button type="button" onClick={() => toggleActive(b)} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black">{b.isActive ? "無効化" : "有効化"}</button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard title="ブランド作成" sub="既存のブランド作成機能を保持しています。">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <div>
                <FieldLabel>brandId</FieldLabel>
                <input className="settings-input" value={newId} onChange={(e) => setNewId(e.target.value)} />
              </div>
              <div>
                <FieldLabel>表示名</FieldLabel>
                <input className="settings-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={createBrand} className="settings-btn-blue rounded-2xl px-5 py-3 text-sm font-black">作成</button>
                <button type="button" onClick={seedVentoRiva} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-black">VENTO/RIVA</button>
              </div>
            </div>
          </GlassCard>

          {editingId && form ? (
            <GlassCard title={`ブランド編集：${editingId}`} sub="既存の captionPolicy / imagePolicy に加え、過去コードの concept / tone / forbidden を復元しています。">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <FieldLabel>表示名</FieldLabel>
                    <input className="settings-input" value={form.name} onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))} />
                  </div>
                  <div>
                    <FieldLabel>コンセプト（過去機能から復元）</FieldLabel>
                    <textarea className="settings-input min-h-28" value={form.concept || ""} onChange={(e) => setForm((p) => (p ? { ...p, concept: e.target.value } : p))} />
                  </div>
                  <div>
                    <FieldLabel>トーン（過去機能から復元）</FieldLabel>
                    <input className="settings-input" value={form.tone || ""} onChange={(e) => setForm((p) => (p ? { ...p, tone: e.target.value } : p))} />
                  </div>
                  <div>
                    <FieldLabel>禁止事項（過去機能から復元）</FieldLabel>
                    <textarea className="settings-input min-h-24" value={form.forbidden || ""} onChange={(e) => setForm((p) => (p ? { ...p, forbidden: e.target.value } : p))} />
                  </div>
                  <div>
                    <FieldLabel>部門モード / axisMode（過去機能から復元）</FieldLabel>
                    <input className="settings-input" value={form.axisMode || "core"} onChange={(e) => setForm((p) => (p ? { ...p, axisMode: e.target.value } : p))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <FieldLabel>思想（voiceText）※AI反映の中核</FieldLabel>
                    <textarea className="settings-input min-h-32" value={form.captionPolicy.voiceText} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, voiceText: e.target.value } } : p))} />
                  </div>
                  <div>
                    <FieldLabel>IGの目的</FieldLabel>
                    <textarea className="settings-input min-h-24" value={form.captionPolicy.igGoal} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, igGoal: e.target.value } } : p))} />
                  </div>
                  <div>
                    <FieldLabel>Xの目的</FieldLabel>
                    <textarea className="settings-input min-h-24" value={form.captionPolicy.xGoal} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, xGoal: e.target.value } } : p))} />
                  </div>

                  <button type="button" onClick={() => setOpenAdvanced((v) => !v)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black">文章詳細設定を{openAdvanced ? "閉じる" : "開く"}</button>
                  {openAdvanced ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div>
                        <FieldLabel>must（1行1項目）</FieldLabel>
                        <textarea className="settings-input min-h-24" value={joinLines(form.captionPolicy.must)} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, must: splitLines(e.target.value) } } : p))} />
                      </div>
                      <div>
                        <FieldLabel>ban（1行1項目）</FieldLabel>
                        <textarea className="settings-input min-h-24" value={joinLines(form.captionPolicy.ban)} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, ban: splitLines(e.target.value) } } : p))} />
                      </div>
                      <div>
                        <FieldLabel>toneDefault</FieldLabel>
                        <input className="settings-input" value={form.captionPolicy.toneDefault} onChange={(e) => setForm((p) => (p ? { ...p, captionPolicy: { ...p.captionPolicy, toneDefault: e.target.value } } : p))} />
                      </div>
                    </div>
                  ) : null}

                  <button type="button" onClick={() => setOpenImage((v) => !v)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black">画像設定を{openImage ? "閉じる" : "開く"}</button>
                  {openImage ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div>
                        <FieldLabel>styleText</FieldLabel>
                        <textarea className="settings-input min-h-24" value={form.imagePolicy.styleText} onChange={(e) => setForm((p) => (p ? { ...p, imagePolicy: { ...p.imagePolicy, styleText: e.target.value } } : p))} />
                      </div>
                      <div>
                        <FieldLabel>rules（1行1項目）</FieldLabel>
                        <textarea className="settings-input min-h-24" value={joinLines(form.imagePolicy.rules)} onChange={(e) => setForm((p) => (p ? { ...p, imagePolicy: { ...p.imagePolicy, rules: splitLines(e.target.value), size: "1024x1024" } } : p))} />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={saveEdit} className="settings-btn-blue rounded-2xl px-6 py-3 text-sm font-black disabled:opacity-50">{saving ? "保存中…" : "ブランド設定を保存"}</button>
                <button type="button" onClick={() => { setEditingId(null); setForm(null); }} className="rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-black">キャンセル</button>
              </div>
            </GlassCard>
          ) : null}
        </div>
      ) : null}

      {detailBrand ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetailBrand(null)}>
          <div className="settings-glass max-h-[88vh] w-full max-w-3xl overflow-auto rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">{allowName(detailBrand.name)}</h2>
                <p className="mt-1 text-sm text-white/55">{detailBrand.id} / {detailBrand.isActive ? "ACTIVE" : "INACTIVE"}</p>
              </div>
              <button type="button" onClick={() => setDetailBrand(null)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">閉じる</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>コンセプト</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.concept || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>トーン</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.tone || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>禁止事項</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.forbidden || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>axisMode</FieldLabel><p className="text-sm text-white/80">{detailBrand.axisMode || "core"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2"><FieldLabel>思想 voiceText</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.captionPolicy.voiceText || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>IG目的</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.captionPolicy.igGoal || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>X目的</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.captionPolicy.xGoal || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>must</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.captionPolicy.must.join("\n") || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><FieldLabel>ban</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.captionPolicy.ban.join("\n") || "未入力"}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2"><FieldLabel>画像 styleText / rules</FieldLabel><p className="whitespace-pre-wrap text-sm text-white/80">{detailBrand.imagePolicy.styleText || "未入力"}\n{detailBrand.imagePolicy.rules.join("\n")}</p></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
