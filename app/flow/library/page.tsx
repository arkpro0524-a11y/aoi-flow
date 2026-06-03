// /app/flow/library/page.tsx
// ユーザーごとの画像ライブラリ。
// 下書きごとに閉じ込めていた画像を、ユーザー単位で再利用できるようにします。
// 既存の下書き・SELL CHECK・PRODUCT SELECTOR などの機能は削除せず、画像資産管理だけを追加します。

"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";
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
  {
    kind: "aiBackground",
    title: "AI生成背景",
    description: "AI背景生成で作成した背景です。商品/背景合成の背景選択から再利用します。",
    folder: (uid) => `users/${uid}/bg-stock`,
  },
  {
    kind: "templateBackground",
    title: "テンプレ背景",
    description: "販売向けに整えたテンプレ背景を保管します。今後、テンプレ背景の共通保存先として使います。",
    folder: (uid) => `users/${uid}/asset-library/template-backgrounds`,
  },
  {
    kind: "uploaded",
    title: "手動アップロード",
    description: "別下書きでも使いたい画像を手動で保管します。",
    folder: (uid) => `users/${uid}/asset-library/uploaded`,
  },
];

function kindLabel(kind: LibraryKind) {
  if (kind === "aiBackground") return "AI生成";
  if (kind === "templateBackground") return "テンプレ";
  return "手動保存";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export default function ImageLibraryPage() {
  const toast = useToast();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string>("");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [activeKind, setActiveKind] = useState<LibraryKind | "all">("all");
  const [uploadKind, setUploadKind] = useState<LibraryKind>("uploaded");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });

    return () => unsub();
  }, []);

  const visibleAssets = useMemo(() => {
    if (activeKind === "all") return assets;
    return assets.filter((asset) => asset.kind === activeKind);
  }, [activeKind, assets]);

  async function loadLibrary(currentUid: string) {
    setLoading(true);

    try {
      const next: LibraryAsset[] = [];

      for (const group of LIBRARY_GROUPS) {
        const folderPath = group.folder(currentUid);
        const folderRef = ref(storage, folderPath);
        const listed = await listAll(folderRef).catch(() => ({ items: [] as any[] }));

        for (const item of listed.items) {
          const url = await getDownloadURL(item).catch(() => "");
          if (!url) continue;

          next.push({
            id: `${group.kind}-${item.fullPath}`,
            kind: group.kind,
            label: item.name,
            url,
            sourcePath: item.fullPath,
          });
        }
      }

      // 既存下書きのテンプレ背景もテンプレ背景として表示します。
      // 過去生成分は users/{uid}/drafts/{draftId}/template-bg に保存されているため、
      // 共通ライブラリだけを見ても0件に見えてしまいます。
      const draftRoot = await listAll(ref(storage, `users/${currentUid}/drafts`)).catch(() => ({
        prefixes: [] as any[],
      }));

      for (const draftPrefix of draftRoot.prefixes || []) {
        if (!draftPrefix?.fullPath) continue;

        const templateFolder = await listAll(ref(storage, `${draftPrefix.fullPath}/template-bg`)).catch(() => ({
          items: [] as any[],
        }));

        for (const item of templateFolder.items || []) {
          const url = await getDownloadURL(item).catch(() => "");
          if (!url) continue;

          next.push({
            id: `templateBackground-${item.fullPath}`,
            kind: "templateBackground",
            label: item.name,
            url,
            sourcePath: item.fullPath,
          });
        }
      }

      const seen = new Set<string>();
      setAssets(
        next.filter((asset) => {
          if (seen.has(asset.url)) return false;
          seen.add(asset.url);
          return true;
        })
      );
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
        const sref = ref(storage, path);
        await uploadBytes(sref, file, { contentType: file.type || "image/png" });
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
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-white/12 bg-black/18 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.35em] text-white/55">
          AOI FLOW / IMAGE LIBRARY
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[0.12em] text-white md:text-4xl">
          画像ライブラリ
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/68">
          一度作った背景画像や、別下書きでも使いたい画像をユーザー単位で保管します。
          背景の選択は「新規作成」内の「商品/背景合成」から行います。
        </p>
      </section>

      <section className="rounded-[1.5rem] border border-white/12 bg-black/18 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-black text-white/90">画像を追加</div>
            <div className="mt-1 text-xs leading-5 text-white/55">
              PC/スマホから背景・テンプレ・参照画像を保存できます。既存の下書き画像は削除しません。
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as LibraryKind)}
              disabled={!uid || uploading}
              className="rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-sm text-white/85"
            >
              <option value="uploaded">手動アップロード</option>
              <option value="templateBackground">テンプレ背景</option>
              <option value="aiBackground">AI生成背景</option>
            </select>

            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!uid || uploading}
              onChange={async (e) => {
                await uploadFiles(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
              className="rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-sm text-white/85"
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveKind("all")}
          className={`rounded-full border px-4 py-2 text-xs font-black ${
            activeKind === "all"
              ? "border-cyan-200/45 bg-cyan-200/15 text-white"
              : "border-white/12 bg-white/8 text-white/62"
          }`}
        >
          すべて {assets.length}
        </button>

        {LIBRARY_GROUPS.map((group) => {
          const count = assets.filter((asset) => asset.kind === group.kind).length;
          return (
            <button
              key={group.kind}
              type="button"
              onClick={() => setActiveKind(group.kind)}
              className={`rounded-full border px-4 py-2 text-xs font-black ${
                activeKind === group.kind
                  ? "border-cyan-200/45 bg-cyan-200/15 text-white"
                  : "border-white/12 bg-white/8 text-white/62"
              }`}
            >
              {group.title} {count}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/12 bg-black/18 p-5 text-sm text-white/70">
          読み込み中...
        </div>
      ) : visibleAssets.length === 0 ? (
        <div className="rounded-2xl border border-white/12 bg-black/18 p-5 text-sm leading-7 text-white/70">
          まだ画像がありません。背景生成後、または手動アップロード後にここへ表示されます。
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {visibleAssets.map((asset) => (
            <article
              key={asset.id}
              className="overflow-hidden rounded-[1.35rem] border border-white/12 bg-black/18"
            >
              <a href={asset.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={asset.url}
                  alt={asset.label}
                  loading="lazy"
                  decoding="async"
                  className="h-40 w-full bg-black/30 object-cover md:h-48"
                  draggable={false}
                />
              </a>

              <div className="space-y-2 p-3">
                <div className="inline-flex rounded-full border border-white/12 bg-white/10 px-2 py-1 text-[11px] font-black text-white/75">
                  {kindLabel(asset.kind)}
                </div>
                <div className="truncate text-xs font-bold text-white/78" title={asset.label}>
                  {asset.label}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={asset.url}
                    download
                    className="inline-flex rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-black text-white/75 transition hover:bg-white/18"
                  >
                    表示 / DL
                  </a>

                  <button
                    type="button"
                    disabled={deletingPath === asset.sourcePath}
                    onClick={() => void deleteAsset(asset)}
                    className="inline-flex rounded-full border border-red-200/30 bg-red-500/15 px-3 py-1.5 text-xs font-black text-red-100 transition hover:bg-red-500/25 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
