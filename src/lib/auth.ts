import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { cloneGuideTemplates } from "@/lib/onboard";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  // 新用户注册瞬间，把引导模板（通关计划 + 引导文档）克隆到该用户名下
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await cloneGuideTemplates(user.id);
          } catch (e) {
            // 克隆失败不抛错，保证注册流程不被影响
            console.error("[onboard] 克隆引导模板失败:", e);
          }
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5分钟，避免跨标签页缓存不一致
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    // 生产环境: 通过环境变量动态注入
    process.env.BETTER_AUTH_URL ?? "",
  ].filter(Boolean),
});
