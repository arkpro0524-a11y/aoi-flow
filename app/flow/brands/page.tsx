// /app/flow/brands/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  orderBy,
  query,
  getDoc,
} from "firebase/firestore";
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
  b.captionPolicy.voiceText =
    "ビンテージ/一点物・文脈・手仕事・静けさ。押し売りしない。誠実に、短く、余白を残す。";
  b.captionPolicy.must = ["誠実", "静か", "押し売りしない", "文脈を残す"];
  b.captionPolicy.ban = ["煽り", "過剰な断定", "大げさな広告口調", "理論名の説明"];
  b.imagePolicy.styleText = "quiet, airy, vintage object mood, minimal, premium, calm, no text";
  return b;
}

function defaultsRiva(): Omit<Brand, "id"> {
  const b = defaultsBase("RIVA");
  b.captionPolicy.voiceText =
    "クラシック/旧車・機械美・手触り・誠実。売り込み臭は避け、静かに格好良く。";
  b.captionPolicy.must = ["誠実", "静か", "機械美", "売り込み臭を消す"];
  b.captionPolicy.ban = ["煽り", "過剰な価格訴求", "理論名の説明", "誇張"];
  b.imagePolicy.styleText =
    "moody, cinematic, classic car / mechanical texture, minimal, premium, calm, no text";
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

/** ✅ “一覧”に合わせた標準UIサイズ */
const UI = {
  pagePad: 16,
  headerPx: 20,
  labelPx: 12,
  inputPx: 14,

  cardPad: 14,
  gap: 14,
};

function Card(props: { title: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25" style={{ padding: UI.cardPad }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-white/95" style={{ fontSize: 16 }}>
            {props.title}
          </div>
          {props.sub ? <div className="text-white/65 mt-1 text-sm">{props.sub}</div> : null}
        </div>
      </div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function HelpBox() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25" style={{ padding: UI.cardPad }}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-black" style={{ fontSize: 16 }}>
          設定（Brands）— 目次 / 解説
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
        >
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {!open ? (
        <div className="text-white/65 mt-2 text-sm">
          ※ ここで入れた内容が AI生成（文章/画像）に反映されます。迷ったら「思想（必須）」だけ。
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm text-white/75 leading-relaxed">
          <div>
            ここで入れた内容が <b>AI生成（文章 / 画像）</b> に反映されます。<br />
            迷ったら「思想（voiceText）」だけ埋めればOK。
          </div>

          <div className="rounded-xl border border-white/12 bg-black/25 p-3 space-y-2">
            <div className="font-black text-white/90">✅ AIに反映される項目</div>
            <div>
              <b>文章</b>：思想 / IG目的 / X目的 / 禁止（ban）/ must / toneDefault<br />
              <b>画像</b>：styleText / rules ＋ 思想（voiceText）を短く入れて寄せる
            </div>
          </div>

          <div className="rounded-xl border border-white/12 bg-black/25 p-3 space-y-2">
            <div className="font-black text-white/90">🧩 各欄の意味</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>思想</b>：ブランドの文章人格（必須）</li>
              <li><b>IG目的 / X目的</b>：媒体ごとの役割</li>
              <li><b>ban</b>：煽り/広告臭を止める安全装置</li>
              <li><b>must</b>：必ず入れたい要素（少数推奨）</li>
              <li><b>styleText / rules</b>：画像の雰囲気と禁止</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BrandsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // 新規作成
  const [newId, setNewId] = useState("client-brand-1");
  const [newName, setNewName] = useState("CLIENT BRAND 1");

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Brand, "id"> | null>(null);
  const [saving, setSaving] = useState(false);

  // 折りたたみ
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const [openImage, setOpenImage] = useState(false);

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function seedVentoRiva() {
    if (!uid) return;
    const base = `users/${uid}/brands`;
    await setDoc(
      doc(db, `${base}/vento`),
      { ...defaultsVento(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    await setDoc(
      doc(db, `${base}/riva`),
      { ...defaultsRiva(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
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

    const ref = doc(db, `users/${uid}/brands/${id}`);
    await setDoc(
      ref,
      {
        ...defaultsBase(name),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await load();
    alert("ブランドを作成しました（次は編集して思想/目的/禁止を入れてください）");
  }

  async function toggleActive(b: Brand) {
    if (!uid) return;
    await updateDoc(doc(db, `users/${uid}/brands/${b.id}`), {
      isActive: !b.isActive,
      updatedAt: serverTimestamp(),
    });
    await load();
  }

  async function startEdit(id: string) {
    if (!uid) return;
    const ref = doc(db, `users/${uid}/brands/${id}`);
    const snap = await getDoc(ref);
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
      await setDoc(
        doc(db, `users/${uid}/brands/${editingId}`),
        { ...form, updatedAt: serverTimestamp() },
        { merge: true }
      );
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

  if (!uid) {
    return <div className="p-6 text-white/80">ログインしてください。</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="shrink-0 border-b border-white/10" style={{ padding: UI.pagePad }}>
        <div style={{ fontSize: UI.headerPx, fontWeight: 900 }}>設定（Brands）</div>
        <div className="text-sm text-white/60 mt-1">
          文章/画像の“人格”を固定する画面（デカすぎないPC版）
        </div>
      </div>

      {/* 本体（PCは2カラム） */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ padding: UI.pagePad }}
      >
        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          {/* 左：ヘルプ＋作成 */}
          <div className="space-y-4">
            <HelpBox />

            <Card title="初期データ（seed）" sub={<>vento / riva の雛形を作ります。</>}>
              <button
                onClick={seedVentoRiva}
                className="rounded-full px-4 py-2 bg-white text-black font-black text-sm"
              >
                vento / riva を作成（seed）
              </button>
            </Card>

            <Card title="新規ブランド作成" sub={<>まずIDと表示名だけ作成 → 次に「編集」。</>}>
              <div className="grid gap-2">
                <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                  brandId
                </div>
                <input
                  className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                  style={{ fontSize: UI.inputPx }}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="brandId（例：client-a）"
                />
                <div className="text-white/75 mt-2" style={{ fontSize: UI.labelPx }}>
                  表示名
                </div>
                <input
                  className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                  style={{ fontSize: UI.inputPx }}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="表示名（例：CLIENT A）"
                />
                <button
                  onClick={createBrand}
                  className="rounded-full px-4 py-2 bg-white text-black font-black w-fit text-sm mt-2"
                >
                  作成
                </button>
                <div className="text-xs text-white/60">
                  ※ 作成後に「編集」で思想（必須）を入れる（ここがAI反映の中核）
                </div>
              </div>
            </Card>
          </div>

          {/* 右：一覧＋編集 */}
          <div className="space-y-4">
            <Card title="一覧" sub="ACTIVEなブランドが /flow/drafts/new の選択肢になります。">
              {loading ? (
                <div className="text-white/70 text-sm">読み込み中...</div>
              ) : rows.length === 0 ? (
                <div className="text-white/70 text-sm">まだありません（seedを押すか新規作成してください）</div>
              ) : (
                <div className="space-y-2">
                  {rows.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="font-black text-white/95">
                          {b.name} <span className="text-white/50 text-xs">({b.id})</span>
                        </div>
                        <div className="text-xs text-white/60">
                          {b.isActive ? "ACTIVE" : "INACTIVE"} / 思想：
                          {String(b?.captionPolicy?.voiceText ?? "").trim() ? "✅" : "❌（空）"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(b.id)}
                          className="rounded-full px-3 py-1 bg-white text-black font-black text-sm"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => toggleActive(b)}
                          className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
                        >
                          {b.isActive ? "無効化" : "有効化"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 編集UI */}
            {editingId && form ? (
              <Card title={`編集：${editingId}`} sub="ここがAI生成の中核。まず思想（必須）だけ埋めればOK。">
                {/* 基本 */}
                <div className="rounded-2xl border border-white/12 bg-black/20 p-4 space-y-3">
                  <div className="font-black text-white/95 text-sm">基本（必須）</div>

                  <div className="grid gap-2">
                    <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                      表示名
                    </div>
                    <input
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                      style={{ fontSize: UI.inputPx }}
                      value={form.name}
                      onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
                    />

                    <div className="text-white/75 mt-3" style={{ fontSize: UI.labelPx }}>
                      思想（voiceText）※必須
                    </div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                      style={{ fontSize: UI.inputPx, minHeight: 110 }}
                      value={form.captionPolicy.voiceText}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, captionPolicy: { ...p.captionPolicy, voiceText: e.target.value } } : p
                        )
                      }
                      placeholder="例：静かに誠実。押し売りしない。余白を残す。"
                    />

                    <div className="grid md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          IGの目的
                        </div>
                        <textarea
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full"
                          style={{ fontSize: UI.inputPx, minHeight: 70 }}
                          value={form.captionPolicy.igGoal}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, captionPolicy: { ...p.captionPolicy, igGoal: e.target.value } } : p
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          Xの目的
                        </div>
                        <textarea
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full"
                          style={{ fontSize: UI.inputPx, minHeight: 70 }}
                          value={form.captionPolicy.xGoal}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, captionPolicy: { ...p.captionPolicy, xGoal: e.target.value } } : p
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ban */}
                <div className="rounded-2xl border border-white/12 bg-black/20 p-4 space-y-3 mt-4">
                  <div className="font-black text-white/95 text-sm">文章の安全装置（ban 推奨）</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                        ban（1行1つ）
                      </div>
                      <textarea
                        className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full"
                        style={{ fontSize: UI.inputPx, minHeight: 110 }}
                        value={joinLines(form.captionPolicy.ban)}
                        onChange={(e) =>
                          setForm((p) =>
                            p
                              ? { ...p, captionPolicy: { ...p.captionPolicy, ban: splitLines(e.target.value) } }
                              : p
                          )
                        }
                        placeholder={"例：\n煽り\n過剰な断定\n大げさな広告口調"}
                      />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-white/70">
                      <div className="font-black text-white/85 mb-2">おすすめ</div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>煽り</li>
                        <li>過剰な断定</li>
                        <li>誇張</li>
                        <li>大げさな広告口調</li>
                        <li>価格の押し売り</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* must / tone */}
                <div className="rounded-2xl border border-white/12 bg-black/20 p-4 space-y-3 mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-white/95 text-sm">詳細（must / toneDefault）</div>
                    <button
                      onClick={() => setOpenAdvanced((v) => !v)}
                      className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
                    >
                      {openAdvanced ? "閉じる" : "開く"}
                    </button>
                  </div>

                  {openAdvanced ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          must（1行1つ）
                        </div>
                        <textarea
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full"
                          style={{ fontSize: UI.inputPx, minHeight: 110 }}
                          value={joinLines(form.captionPolicy.must)}
                          onChange={(e) =>
                            setForm((p) =>
                              p
                                ? { ...p, captionPolicy: { ...p.captionPolicy, must: splitLines(e.target.value) } }
                                : p
                            )
                          }
                        />
                        <div className="text-xs text-white/55 mt-1">※ 入れすぎ注意（少数推奨）</div>
                      </div>

                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          toneDefault
                        </div>
                        <input
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full"
                          style={{ fontSize: UI.inputPx }}
                          value={form.captionPolicy.toneDefault}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, captionPolicy: { ...p.captionPolicy, toneDefault: e.target.value } } : p
                            )
                          }
                        />
                        <div className="text-xs text-white/55 mt-2">※ 迷うなら触らない</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/65">※ 普段は不要。必要になったら開く。</div>
                  )}
                </div>

                {/* image */}
                <div className="rounded-2xl border border-white/12 bg-black/20 p-4 space-y-3 mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-white/95 text-sm">画像（styleText / rules）</div>
                    <button
                      onClick={() => setOpenImage((v) => !v)}
                      className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
                    >
                      {openImage ? "閉じる" : "開く"}
                    </button>
                  </div>

                  {openImage ? (
                    <div className="grid gap-3">
                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          styleText
                        </div>
                        <textarea
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                          style={{ fontSize: UI.inputPx, minHeight: 80 }}
                          value={form.imagePolicy.styleText}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, imagePolicy: { ...p.imagePolicy, styleText: e.target.value } } : p
                            )
                          }
                        />
                      </div>

                      <div>
                        <div className="text-white/75" style={{ fontSize: UI.labelPx }}>
                          rules（1行1つ）
                        </div>
                        <textarea
                          className="rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                          style={{ fontSize: UI.inputPx, minHeight: 110 }}
                          value={joinLines(form.imagePolicy.rules)}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, imagePolicy: { ...p.imagePolicy, rules: splitLines(e.target.value) } } : p
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/65">※ 画像生成を使う時だけ開けばOK。</div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap mt-4">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-full px-4 py-2 bg-white text-black font-black disabled:opacity-40 text-sm"
                  >
                    保存（AIに反映）
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setForm(null);
                    }}
                    className="rounded-full px-4 py-2 bg-white/15 border border-white/20 font-bold text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}