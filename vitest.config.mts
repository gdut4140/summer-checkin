import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // 与 tsconfig.json 的 "paths" 对齐（测试里若间接 import 到 Prisma client，
    // 少了第二条别名会在解析阶段就报错）
    alias: {
      "@prisma-generated": fileURLToPath(new URL("./prisma/generated", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // 集成测试需要真实 PostgreSQL，默认不跑；用 `npm run test:db` 单独执行
    // （配置见 vitest.integration.config.mts）
    exclude: ["tests/integration/**"],
    // 目前只测纯逻辑（分片 / 向量 / 工具兜底 / 校验 schema / 渲染管线），无需 DOM。
    // 日后要测组件再改 jsdom 或加 environmentMatchGlobs。
    environment: "node",
  },
});
