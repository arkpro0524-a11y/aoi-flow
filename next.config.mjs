// next.config.mjs
// ✅ PWAは「manifest + service worker（最小）」で実装する方針。
// next-pwa などの追加依存は使わない（再構築性 / 仕様固定のため）

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;