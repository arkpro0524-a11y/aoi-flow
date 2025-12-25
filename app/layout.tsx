import "./globals.css";
import ToastProvider from "@/components/ToastProvider";
import ClientCrashGuard from "@/components/ClientCrashGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* ✅ まずクラッシュガードで包む（本番でも原因が見える） */}
        <ClientCrashGuard>
          <ToastProvider>{children}</ToastProvider>
        </ClientCrashGuard>
      </body>
    </html>
  );
}