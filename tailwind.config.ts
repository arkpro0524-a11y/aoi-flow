// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
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