// 独立 Prisma 实例（sidecar 与 Next.js 各自持有连接池，互不干扰）
// 复用同一份生成的 client，相对路径 import 避免 @/ 别名依赖

import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma = new PrismaClient({ adapter });
