// /app/flow/library/page.tsx
// ユーザーごとのライブラリ。
// Firebase Storage の読み込み・アップロード・削除機能は残し、表示だけを小型カード中心の管理画面へ整理します。

"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/firebase";
import { useToast } from "@/components/ToastProvider";

type LibraryKind = "aiBackground" | "templateBackground" | "uploaded";

type LibraryAsset = {
  id: string;
  kind: LibraryKind;
  label: string;
  url: string;
  sourcePath: string;
};

const LIBRARY_GROUPS: Array<{
  kind: LibraryKind;
  title: string;
  description: string;
  folder: (uid: string) => string;
}> = [
  { kind: "aiBackground", title: "AI背景", description: "AI背景生成で作成した背景です。", folder: (uid) => `users/${uid}/bg-stock` },
  { kind: "templateBackground", title: "テンプレ背景", description: "販売向けに整えたテンプレ背景です。", folder: (uid) => `users/${uid}/asset-library/template-backgrounds` },
  { kind: "uploaded", title: "商品画像", description: "別下書きでも使いたい画像です。", folder: (uid) => `users/${uid}/asset-library/uploaded` },
];

function kindLabel(kind: LibraryKind) {
  if (kind === "aiBackground") return "背景画像";
  if (kind === "templateBackground") return "テンプレ背景";
  return "商品画像";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function formatCount(n: number) {
  return n.toLocaleString("ja-JP");
}

export default function ImageLibraryPage() {
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState("");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [activeKind, setActiveKind] = useState<LibraryKind | "all">("all");
  const [uploadKind, setUploadKind] = useState<LibraryKind>("uploaded");
  const [queryText, setQueryText] = useState("");
  const [sortMode, setSortMode] = useState<"new" | "name">("new");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    return {
      all: assets.length,
      uploaded: assets.filter((x) => x.kind === "uploaded").length,
      aiBackground: assets.filter((x) => x.kind === "aiBackground").length,
      templateBackground: assets.filter((x) => x.kind === "templateBackground").length,
    };
  }, [assets]);

  const visibleAssets = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      const kindOk = activeKind === "all" || asset.kind === activeKind;
      const queryOk = !q || `${asset.label} ${kindLabel(asset.kind)}`.toLowerCase().includes(q);
      return kindOk && queryOk;
    });

    return filtered.sort((a, b) => {
      if (sortMode === "name") return a.label.localeCompare(b.label, "ja");
      return b.sourcePath.localeCompare(a.sourcePath, "ja");
    });
  }, [activeKind, assets, queryText, sortMode]);

  async function loadLibrary(currentUid: string) {
    setLoading(true);

    try {
      const next: LibraryAsset[] = [];

      for (const group of LIBRARY_GROUPS) {
        const folderRef = ref(storage, group.folder(currentUid));
        const listed = await listAll(folderRef).catch(() => ({ items: [] as any[] }));

        for (const item of listed.items) {
          const url = await getDownloadURL(item).catch(() => "");
          if (!url) continue;
          next.push({ id: `${group.kind}-${item.fullPath}`, kind: group.kind, label: item.name, url, sourcePath: item.fullPath });
        }
      }

      // 既存下書きのテンプレ背景もテンプレ背景として表示します。
      const draftRoot = await listAll(ref(storage, `users/${currentUid}/drafts`)).catch(() => ({ prefixes: [] as any[] }));

      for (const draftPrefix of draftRoot.prefixes || []) {
        if (!draftPrefix?.fullPath) continue;
        const templateFolder = await listAll(ref(storage, `${draftPrefix.fullPath}/template-bg`)).catch(() => ({ items: [] as any[] }));

        for (const item of templateFolder.items || []) {
          const url = await getDownloadURL(item).catch(() => "");
          if (!url) continue;
          next.push({ id: `templateBackground-${item.fullPath}`, kind: "templateBackground", label: item.name, url, sourcePath: item.fullPath });
        }
      }

      const seen = new Set<string>();
      setAssets(next.filter((asset) => {
        if (seen.has(asset.url)) return false;
        seen.add(asset.url);
        return true;
      }));
    } catch (e) {
      console.error(e);
      toast.push("画像ライブラリの取得に失敗しました");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!uid) {
      setAssets([]);
      setLoading(false);
      return;
    }
    void loadLibrary(uid);
  }, [uid]);

  async function uploadFiles(files: FileList | null) {
    if (!uid || !files || files.length === 0) return;

    setUploading(true);

    try {
      const targetGroup = LIBRARY_GROUPS.find((group) => group.kind === uploadKind) ?? LIBRARY_GROUPS[2];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const name = safeFileName(file.name);
        const path = `${targetGroup.folder(uid)}/${Date.now()}_${name}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type || "image/png" });
      }

      toast.push("画像をライブラリへ保存しました");
      await loadLibrary(uid);
    } catch (e: any) {
      console.error(e);
      toast.push(`画像保存に失敗：${e?.message || "不明"}`);
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(asset: LibraryAsset) {
    if (!uid || !asset.sourcePath) return;

    const ok = window.confirm("この画像をライブラリから削除します。よろしいですか？");
    if (!ok) return;

    setDeletingPath(asset.sourcePath);

    try {
      await deleteObject(ref(storage, asset.sourcePath));
      toast.push("画像を削除しました");
      await loadLibrary(uid);
    } catch (e: any) {
      console.error(e);
      toast.push(`画像削除に失敗：${e?.message || "不明"}`);
    } finally {
      setDeletingPath("");
    }
  }

  return (
    <div className="text-white" style={{ display: "grid", gap: 18 }}>
      <style>{`
        .library-glass { border: 1px solid rgba(125,211,252,.12); background: linear-gradient(135deg, rgba(8,32,50,.74), rgba(7,22,36,.58)); box-shadow: 0 22px 70px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(18px); }
        .library-chip { border: 1px solid rgba(125,211,252,.12); background: rgba(255,255,255,.055); color: rgba(255,255,255,.88); }
        .library-chip-active { background: linear-gradient(135deg, rgba(37,99,235,.70), rgba(14,165,233,.32)); border-color: rgba(147,197,253,.35); }
        .library-input { border: 1px solid rgba(125,211,252,.14); background: rgba(5,18,31,.62); color: rgba(255,255,255,.90); outline: none; }
        .library-mini-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap:10px; }
        .library-mini-card { border:1px solid rgba(125,211,252,.12); background:linear-gradient(180deg, rgba(255,255,255,.075), rgba(7,22,36,.72)); border-radius:16px; overflow:hidden; min-width:0; }
        .library-mini-img { width:100%; height:70px; object-fit:cover; display:block; background:rgba(0,0,0,.26); }
        @media (min-width: 1280px){ .library-mini-grid { grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); } .library-mini-img { height:76px; } }
      `}</style>

      <header style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(260px,520px)", gap: 18, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: ".08em" }}>ライブラリ</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(255,255,255,.66)" }}>作成したコンテンツ・データを一元管理できます</p>
        </div>
        <div className="library-glass" style={{ borderRadius: 999, padding: "12px 18px", display: "flex", gap: 10, alignItems: "center" }}>
          <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="検索（タイトル・タグ・メモなど）" style={{ flex: 1, background: "transparent", color: "white", outline: "none", border: 0, fontSize: 14 }} />
          <span style={{ color: "rgba(255,255,255,.45)" }}>⌕</span>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
        <button type="button" onClick={() => setActiveKind("all")} className={`library-chip ${activeKind === "all" ? "library-chip-active" : ""}`} style={{ borderRadius: 18, padding: 14, textAlign: "left" }}><b>すべて</b><div>{formatCount(counts.all)}</div></button>
        <button type="button" onClick={() => setActiveKind("uploaded")} className={`library-chip ${activeKind === "uploaded" ? "library-chip-active" : ""}`} style={{ borderRadius: 18, padding: 14, textAlign: "left" }}><b>商品画像</b><div>{formatCount(counts.uploaded)}</div></button>
        <button type="button" onClick={() => setActiveKind("aiBackground")} className={`library-chip ${activeKind === "aiBackground" ? "library-chip-active" : ""}`} style={{ borderRadius: 18, padding: 14, textAlign: "left" }}><b>AI背景</b><div>{formatCount(counts.aiBackground)}</div></button>
        <button type="button" onClick={() => setActiveKind("templateBackground")} className={`library-chip ${activeKind === "templateBackground" ? "library-chip-active" : ""}`} style={{ borderRadius: 18, padding: 14, textAlign: "left" }}><b>テンプレ背景</b><div>{formatCount(counts.templateBackground)}</div></button>
        <a href="/flow/market-research" className="library-chip" style={{ borderRadius: 18, padding: 14, color: "white", textDecoration: "none" }}><b>市場DB</b><div>移動</div></a>
        <a href="/flow/sell-check/outcomes" className="library-chip" style={{ borderRadius: 18, padding: 14, color: "white", textDecoration: "none" }}><b>学習DB</b><div>確認</div></a>
      </section>

      <section className="library-glass" style={{ borderRadius: 24, padding: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <select value={activeKind} onChange={(e) => setActiveKind(e.target.value as LibraryKind | "all")} className="library-input" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <option value="all">すべてのタイプ</option>
            {LIBRARY_GROUPS.map((group) => <option key={group.kind} value={group.kind}>{group.title}</option>)}
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as "new" | "name")} className="library-input" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <option value="new">更新日が新しい順</option>
            <option value="name">名前順</option>
          </select>
          <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as LibraryKind)} disabled={!uid || uploading} className="library-input" style={{ borderRadius: 14, padding: "10px 12px" }}>
            <option value="uploaded">手動アップロード</option>
            <option value="templateBackground">テンプレ背景</option>
            <option value="aiBackground">AI生成背景</option>
          </select>
          <label className="library-input" style={{ borderRadius: 14, padding: "10px 12px", cursor: "pointer" }}>
            ファイルをアップロード
            <input type="file" accept="image/*" multiple disabled={!uid || uploading} onChange={async (e) => { await uploadFiles(e.currentTarget.files); e.currentTarget.value = ""; }} style={{ display: "none" }} />
          </label>
        </div>
        <button type="button" onClick={() => uid && loadLibrary(uid)} className="library-input" style={{ borderRadius: 14, padding: "10px 14px", fontWeight: 900 }}>再読み込み</button>
      </section>

      {loading ? (
        <div className="library-glass" style={{ borderRadius: 24, padding: 24, color: "rgba(255,255,255,.7)" }}>読み込み中...</div>
      ) : visibleAssets.length === 0 ? (
        <div className="library-glass" style={{ borderRadius: 24, padding: 24, color: "rgba(255,255,255,.7)" }}>まだ画像がありません。背景生成後、または手動アップロード後にここへ表示されます。</div>
      ) : (
        <section className="library-mini-grid">
          {visibleAssets.map((asset) => (
            <article key={asset.id} className="library-mini-card">
              <a href={asset.url} target="_blank" rel="noreferrer" style={{ display: "block", position: "relative" }}>
                <img src={asset.url} alt={asset.label} loading="lazy" decoding="async" className="library-mini-img" draggable={false} />
                <span style={{ position: "absolute", left: 6, bottom: 6, borderRadius: 7, background: "rgba(0,0,0,.48)", padding: "3px 6px", fontSize: 10, fontWeight: 900 }}>{kindLabel(asset.kind)}</span>
              </a>
              <div style={{ padding: 8, display: "grid", gap: 6 }}>
                <div title={asset.label} style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.label}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <a href={asset.url} download style={{ flex: 1, borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.78)", textAlign: "center", padding: "4px 6px", fontSize: 10, fontWeight: 900, textDecoration: "none" }}>表示</a>
                  <button type="button" disabled={deletingPath === asset.sourcePath} onClick={() => void deleteAsset(asset)} style={{ flex: 1, borderRadius: 999, border: "1px solid rgba(248,113,113,.32)", background: "rgba(239,68,68,.16)", color: "#fecaca", padding: "4px 6px", fontSize: 10, fontWeight: 900 }}>削除</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
