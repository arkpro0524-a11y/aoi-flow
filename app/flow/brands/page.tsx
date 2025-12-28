// /app/flow/brands/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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
function allowName(name: any) {
  const s = typeof name === "string" ? name.trim() : "";
  return s || "（名称なし）";
}

function Card(props: { title: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-white/95 text-base">{props.title}</div>
          {props.sub ? (
            <div className="text-white/65 mt-1 text-sm leading-relaxed">{props.sub}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function HelpBox() {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/35 p-4">
      <div className="font-black text-lg">設定（Brands）</div>

      <div className="mt-2 text-white/75 text-sm leading-relaxed">
        ここで入れた内容が <b>AI生成（文章 / 画像）</b> に反映されます。<br />
        迷ったら「思想（voiceText）」だけ埋めればOK。残りは必要になった時だけ使います。
      </div>

      <div className="mt-3 rounded-xl border border-white/12 bg-black/25 p-3">
        <div className="font-black text-white/90 text-sm">✅ AIに反映される項目</div>
        <div className="mt-2 text-white/75 text-sm leading-relaxed">
          <b>文章生成</b>：思想（voiceText）/ IG目的 / X目的 / 禁止（ban）/ must / toneDefault<br />
          <b>画像生成</b>：styleText / rules ＋（今回から）思想（voiceText）を短く入れて寄せる
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/12 bg-black/25 p-3">
        <div className="font-black text-white/90 text-sm">🧩 各欄の意味（混乱防止）</div>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-white/75 text-sm">
          <li><b>思想（voiceText）</b>：ブランド文章の人格（必須）。空だとブランドらしさが出ません。</li>
          <li><b>IG目的 / X目的</b>：媒体ごとの役割を固定します。</li>
          <li><b>ban（禁止）</b>：煽り・広告臭を止める安全装置。</li>
          <li><b>must</b>：必ず入れたい要素（少数推奨）。</li>
          <li><b>toneDefault</b>：文章テンションの初期値（上級者用）。</li>
          <li><b>styleText / rules</b>：画像の雰囲気指定と禁止事項。</li>
        </ul>
      </div>
    </div>
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

  if (!uid) return <div className="p-6 text-white/80">ログインしてください。</div>;

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto w-full max-w-[1100px] space-y-3">
        <HelpBox />

        <Card
          title="初期データ（seed）"
          sub={<>vento / riva の雛形を作ります。後から思想・目的・禁止をあなた用に調整してください。</>}
        >
          <button
            onClick={seedVentoRiva}
            className="rounded-full px-4 py-2 bg-white text-black font-black text-sm"
          >
            vento / riva を作成（seed）
          </button>
        </Card>

        <Card title="新規ブランド作成" sub={<>まずIDと表示名だけ作成 → 「編集」で思想（必須）と目的を入れる流れです。</>}>
          <div className="grid gap-2 max-w-[560px]">
            <div className="text-white/80 font-bold text-xs">brandId</div>
            <input
              className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="brandId（例：client-a）"
            />

            <div className="text-white/80 font-bold mt-2 text-xs">表示名</div>
            <input
              className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="表示名（例：CLIENT A）"
            />

            <button
              onClick={createBrand}
              className="rounded-full px-4 py-2 bg-white text-black font-black w-fit mt-2 text-sm"
            >
              作成
            </button>

            <div className="text-white/60 text-xs">
              ※ 作成後に「編集」で思想（必須）を入れる（ここがAI反映の中核）
            </div>
          </div>
        </Card>

        <Card title="一覧" sub={<>ACTIVE なブランドが /flow/drafts/new の選択肢になります。</>}>
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
                  <div className="min-w-0">
                    <div className="font-black text-sm">
                      {allowName(b.name)}{" "}
                      <span className="text-white/50 text-xs">({b.id})</span>
                    </div>
                    <div className="text-white/60 mt-1 text-xs">
                      {b.isActive ? "ACTIVE" : "INACTIVE"} / 思想：
                      {String(map?.[b.id]?.captionPolicy?.voiceText ?? "").trim() ? "✅" : "❌（空）"}
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

        {editingId && form ? (
          <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
            <div className="font-black text-lg">編集：{editingId}</div>

            {/* 基本 */}
            <div className="mt-3 rounded-2xl border border-white/12 bg-black/20 p-4">
              <div className="font-black text-white/95 text-base">基本（必須）</div>

              <div className="grid gap-2 mt-3">
                <div className="text-white/80 font-bold text-xs">表示名</div>
                <input
                  className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
                />

                <div className="text-white/80 font-bold mt-3 text-xs">
                  思想（voiceText）※必須 / 文章と画像に反映
                </div>
                <textarea
                  className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm leading-relaxed"
                  value={form.captionPolicy.voiceText}
                  onChange={(e) =>
                    setForm((p) =>
                      p ? { ...p, captionPolicy: { ...p.captionPolicy, voiceText: e.target.value } } : p
                    )
                  }
                  placeholder="例：静かに誠実。押し売りしない。余白を残す。"
                  style={{ minHeight: 110 }}
                />

                <div className="grid lg:grid-cols-2 gap-3 mt-3">
                  <div>
                    <div className="text-white/80 font-bold text-xs">IGの目的</div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full text-sm leading-relaxed"
                      value={form.captionPolicy.igGoal}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, captionPolicy: { ...p.captionPolicy, igGoal: e.target.value } } : p
                        )
                      }
                      placeholder="例：投稿できる本文として完成させる"
                      style={{ minHeight: 74 }}
                    />
                  </div>
                  <div>
                    <div className="text-white/80 font-bold text-xs">Xの目的</div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full text-sm leading-relaxed"
                      value={form.captionPolicy.xGoal}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, captionPolicy: { ...p.captionPolicy, xGoal: e.target.value } } : p
                        )
                      }
                      placeholder="例：短文で注意→興味の導線を作る"
                      style={{ minHeight: 74 }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 安全装置 */}
            <div className="mt-3 rounded-2xl border border-white/12 bg-black/20 p-4">
              <div className="font-black text-white/95 text-base">文章の安全装置（推奨）</div>
              <div className="text-white/70 mt-1 text-sm leading-relaxed">
                ban（禁止）は「煽り」「広告臭」を止めるための欄です。迷っても入れておく価値が高いです。
              </div>

              <div className="grid lg:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-white/80 font-bold text-xs">ban（禁止 / 1行1つ）</div>
                  <textarea
                    className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full text-sm leading-relaxed"
                    value={joinLines(form.captionPolicy.ban)}
                    onChange={(e) =>
                      setForm((p) =>
                        p
                          ? { ...p, captionPolicy: { ...p.captionPolicy, ban: splitLines(e.target.value) } }
                          : p
                      )
                    }
                    placeholder={"例：\n煽り\n過剰な断定\n大げさな広告口調"}
                    style={{ minHeight: 120 }}
                  />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className="font-black text-white/85 text-sm">おすすめのban例</div>
                  <ul className="list-disc pl-5 mt-2 space-y-1 text-white/70 text-sm">
                    <li>煽り</li>
                    <li>過剰な断定</li>
                    <li>誇張</li>
                    <li>大げさな広告口調</li>
                    <li>価格の押し売り</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 詳細 */}
            <div className="mt-3 rounded-2xl border border-white/12 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-white/95 text-base">詳細（must / toneDefault）</div>
                <button
                  onClick={() => setOpenAdvanced((v) => !v)}
                  className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
                >
                  {openAdvanced ? "閉じる" : "開く"}
                </button>
              </div>

              {openAdvanced ? (
                <div className="grid lg:grid-cols-2 gap-3 mt-3">
                  <div>
                    <div className="text-white/80 font-bold text-xs">must（必ず入れたい / 1行1つ）</div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full text-sm leading-relaxed"
                      value={joinLines(form.captionPolicy.must)}
                      onChange={(e) =>
                        setForm((p) =>
                          p
                            ? { ...p, captionPolicy: { ...p.captionPolicy, must: splitLines(e.target.value) } }
                            : p
                        )
                      }
                      placeholder={"例：\n誠実\n静か\n余白"}
                      style={{ minHeight: 120 }}
                    />
                    <div className="text-white/55 mt-1 text-xs">※ 入れすぎると文章が固くなるので少数推奨</div>
                  </div>

                  <div>
                    <div className="text-white/80 font-bold text-xs">toneDefault（上級者用）</div>
                    <input
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 w-full text-sm"
                      value={form.captionPolicy.toneDefault}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, captionPolicy: { ...p.captionPolicy, toneDefault: e.target.value } } : p
                        )
                      }
                      placeholder='例："calm, honest, concise"'
                    />
                    <div className="text-white/55 mt-2 text-xs">※ 空でも動きます。迷うなら触らないでOK。</div>
                  </div>
                </div>
              ) : (
                <div className="text-white/65 mt-2 text-sm">※ 普段は不要。必要になったら開いて調整。</div>
              )}
            </div>

            {/* 画像 */}
            <div className="mt-3 rounded-2xl border border-white/12 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-white/95 text-base">画像（styleText / rules）</div>
                <button
                  onClick={() => setOpenImage((v) => !v)}
                  className="rounded-full px-3 py-1 bg-white/15 border border-white/20 font-bold text-sm"
                >
                  {openImage ? "閉じる" : "開く"}
                </button>
              </div>

              {openImage ? (
                <div className="grid gap-3 mt-3">
                  <div className="text-white/70 text-sm leading-relaxed">
                    画像生成を使うなら必要。迷うなら <b>styleText は雰囲気</b>、<b>rules は禁止事項</b> として扱えばOK。
                  </div>

                  <div>
                    <div className="text-white/80 font-bold text-xs">styleText（雰囲気）</div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm leading-relaxed w-full"
                      value={form.imagePolicy.styleText}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, imagePolicy: { ...p.imagePolicy, styleText: e.target.value } } : p
                        )
                      }
                      placeholder='例："quiet, minimal, premium, calm, no text"'
                      style={{ minHeight: 90 }}
                    />
                  </div>

                  <div>
                    <div className="text-white/80 font-bold text-xs">rules（禁止 / 1行1つ）</div>
                    <textarea
                      className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm leading-relaxed w-full"
                      value={joinLines(form.imagePolicy.rules)}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, imagePolicy: { ...p.imagePolicy, rules: splitLines(e.target.value) } } : p
                        )
                      }
                      placeholder={"例：\nno text\nno logos\nno watermark\nhigh quality\ncentered composition"}
                      style={{ minHeight: 120 }}
                    />
                  </div>

                  <div className="text-white/55 text-xs">
                    ※ 画像生成にも「思想（voiceText）」が短く入ります（ブランドに寄せるため）。
                  </div>
                </div>
              ) : (
                <div className="text-white/65 mt-2 text-sm">※ 画像生成を使う時だけ開けばOK。</div>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}