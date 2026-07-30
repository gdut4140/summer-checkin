import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Docker 部署: 生成自包含的最小运行时目录
  output: "standalone",
};

export default nextConfig;
