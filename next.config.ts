import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Docker 部署: 生成自包含的最小运行时目录
  output: "standalone",
  // ali-oss 的依赖树（urllib/proxy-agent）有 Turbopack 静态分析不了的老式 require，
  // 标记为服务端外部包，构建不打包、运行时由 Node 从 node_modules 直接 require。
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
