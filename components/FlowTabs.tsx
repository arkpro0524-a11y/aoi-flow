// components/FlowTabs.tsx
// ✅ Mobile専用仕様：タブ切替式 [入力][AI案][編集]
// ✅ タップ領域 44px以上（min-h）
"use client";

type TabKey = "input" | "ai" | "edit";

export default function FlowTabs({
  tab,
  setTab,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
}) {
  const item = (key: TabKey, label: string) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className={[
          "min-h-[44px] flex-1 rounded-2xl px-4 text-sm transition",
          "bg-white/5 hover:bg-white/10",
          active ? "bg-white/12" : "",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex gap-2">
      {item("input", "入力")}
      {item("ai", "AI案")}
      {item("edit", "編集")}
    </div>
  );
}