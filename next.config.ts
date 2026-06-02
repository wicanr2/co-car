import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 釘住 workspace root,避免被外圍 /home/anr2/package-lock.json 誤判
  turbopack: {
    root: __dirname,
  },
  // 關閉開發模式左下角的 Next.js 指示器(N)
  devIndicators: false,
};

export default nextConfig;
