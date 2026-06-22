// next.config.mjs
import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },

  // Next.js 16 / Turbopack が上位ディレクトリの package-lock.json を root と誤認すると、
  // "@/components/..." が "./components/..." として解決され、AuthGate / FlowShell 等が見つからなくなります。
  // プロジェクト自身を root に固定して既存 import を壊さないようにします。
  turbopack: {
    root: path.resolve(process.cwd()),
  },

  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(process.cwd()),
    };
    return config;
  },
};

export default nextConfig;
