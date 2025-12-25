// /app/layout.tsx
import "./globals.css";
import ToastProvider from "../components/ToastProvider";
import ClientCrashGuard from "../components/ClientCrashGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* スマホで落ちた時に原因を画面に出す */}
        <ClientCrashGuard />

        {/* 既存のToastは維持 */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}