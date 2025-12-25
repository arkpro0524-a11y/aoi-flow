// /app/layout.tsx
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import AuthGate from "@/components/AuthGate";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* 背景のビネット（globals.cssで使ってる） */}
        <div id="_vignette" />
        {/* UI本体（globals.cssのz-index安定の核心） */}
        <div id="_appRoot">
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}