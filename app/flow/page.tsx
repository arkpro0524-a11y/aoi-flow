// app/flow/page.tsx
// /flow 配下で使うマイページ型トップ。
// 既存機能は削除せず、各ページへ移動する入口を整えています。

import Link from "next/link";

type FeatureCard = {
  href: string;
  title: string;
  subtitle: string;
  image?: string;
  emoji?: string;
  accent: string;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    href: "/flow/drafts/new",
    title: "新規作成",
    subtitle: "商品画像・背景・文章・動画を作る",
    image: "/text-video-logo.png",
    accent: "Create",
  },
  {
    href: "/flow/drafts",
    title: "下書き一覧",
    subtitle: "作成中の商品投稿を軽く確認する",
    image: "/drafts_logo.png",
    accent: "Drafts",
  },
  {
    href: "/flow/library",
    title: "画像ライブラリ",
    subtitle: "背景・テンプレ・完成画像を再利用する",
    image: "/image_library_logo.png",
    accent: "Assets",
  },
  {
    href: "/flow/product-selector",
    title: "商品選定",
    subtitle: "スクショや市場観測から候補を探す",
    image: "/product_selector_logo.png",
    accent: "Selector",
  },
  {
    href: "/flow/sell-check",
    title: "売れる診断",
    subtitle: "個別商品の価格・利益・仕入れ判断",
    image: "/sales_diagnosis_logo.png",
    accent: "Check",
  },
  {
    href: "/flow/sell-check/admin",
    title: "学習データ管理",
    subtitle: "本文・画像・CSVから学習データを蓄積",
    image: "/data_collection_logo.png",
    accent: "Data",
  },
  {
    href: "/flow/posted",
    title: "投稿済み",
    subtitle: "出品・売却結果を振り返る",
    image: "/posted_logo.png",
    accent: "Posted",
  },
  {
    href: "/flow/brands",
    title: "設定",
    subtitle: "ブランド・運用設定を確認する",
    image: "/settings_logo.png",
    accent: "Settings",
  },
];

function FeatureCardView({ item }: { item: FeatureCard }) {
  return (
    <Link
      href={item.href}
      className="group block h-full overflow-hidden rounded-[1.35rem] border border-white/12 bg-white/[0.08] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 hover:bg-white/[0.13]"
    >
      <div className="flex h-32 items-center justify-center text-[#0f1e30] sm:h-36">
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            className="h-full max-h-32 max-w-full object-contain transition duration-300 group-hover:scale-[1.06] sm:max-h-36"
            draggable={false}
          />
        ) : (
          <div className="text-center">
            <div className="text-4xl leading-none sm:text-5xl">{item.emoji}</div>
            <div className="mt-3 text-[10px] font-black tracking-[0.24em] text-[#1c4f82]/70">
              {item.accent}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-base font-black tracking-[0.1em] text-white sm:text-lg">
          {item.title}
        </div>
        <div className="mt-2 text-xs leading-5 text-white/62 sm:text-sm sm:leading-6">
          {item.subtitle}
        </div>
      </div>
    </Link>
  );
}

export default function FlowIndexPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-white/12 bg-black/18 p-5 md:p-7">
        <div className="text-xs font-black tracking-[0.3em] text-white/55">
          AOI FLOW / MY PAGE
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-[0.12em] text-white md:text-4xl">
          作業入口
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/70 md:text-base">
          下書き、画像ライブラリ、商品選定、売れる診断へここから移動します。
          作った画像や背景は資産として蓄積し、次の下書きでも再利用する前提にします。
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURE_CARDS.map((item) => (
          <FeatureCardView key={item.href} item={item} />
        ))}
      </section>
    </div>
  );
}
