import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 集成测试单独一份配置：需要真实 PostgreSQL，默认的 `npm test` 不跑。
// 运行：npm run test:db
export default defineConfig({
  resolve: {
    alias: {
      "@prisma-generated": fileURLToPath(
        new URL("./prisma/generated", import.meta.url)
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    // 真实数据库 + 建用户/上传/检索，给足余量
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // 避免并行用例互相清理数据
    fileParallelism: false,
  },
});
