// tailwind.config.ts
// ─────────────────────────────────────────────
// 目的：Tailwindの生成対象とテーマ定義だけを安定させる。
// 注意：Tailwind v4系の型では darkMode: ["class"] が型エラーになりやすい。
// → "class" に固定してエラーを消す（構造増やさない）。

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  // ✅ 配列ではなく "class" にする（TSエラー回避）
  darkMode: "class",

  theme: {
    extend: {
      colors: {
        // AIRAの基調色（世界観：静・透明・誠実）
        aira: {
          blue: "#1C4F82",
          white: "#F8FAFC",
          gray: "#E7ECF1",
          navy: "#0F1E30",
        },
      },
    },
  },

  plugins: [],
};

export default config;