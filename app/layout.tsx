// /app/layout.tsx
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "AOI FLOW",
  applicationName: "AOI FLOW",
  themeColor: "#0A1020",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {/* 背景ビネット */}
        <div id="_vignette" />

        {/* アプリ本体 */}
        <div id="_appRoot">
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </div>
      </body>
    </html>
  );
}