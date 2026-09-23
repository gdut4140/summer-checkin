/* ============================================================
 * pgvector 迁移验证：跑真实的检索代码路径，确认迁移后功能正常
 *
 * 用法:  tsx scripts/verify-pgvector.ts
 *
 * 覆盖：
 *   ① 写入路径   —— 插入一条 vector(1024) chunk，确认 ::vector 参数可用
 *   ② 检索路径   —— searchKnowledge 返回结果、按相似度降序
 *   ③ 数据隔离   —— 跨 userId 查不到别人的 chunk
 *   ④ 记忆检索   —— getRelevantMemories 的 pgvector 路径
 *   ⑤ 无截断     —— 检索不再受旧的 ORDER BY createdAt DESC LIMIT 1000 限制
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // 动态 import：见 normalize-embeddings.ts 的说明（ESM import 提升会
  // 让 model-pool 在 loadEnv 之前初始化，拿到空 API key）
  const { searchKnowledge } = await import("../src/lib/rag");
  const { getRelevantMemories } = await import("../src/lib/memory");
  const { embedText } = await import("../src/lib/rag/client");
  const { toPgVector } = await import("../src/lib/rag/retriever");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // ---- 找一个有数据的用户 ----
  const owners = await prisma.$queryRawUnsafe<Array<{ userId: string; n: number }>>(
    `SELECT "userId", COUNT(*)::int AS n FROM documentchunk GROUP BY 1 ORDER BY 2 DESC LIMIT 2`
  );
  if (owners.length === 0) {
    console.error("本地库没有 documentchunk 数据，先上传文档或插测试数据");
    await prisma.$disconnect();
    process.exit(1);
  }
  const userA = owners[0].userId;
  const userB = owners[1]?.userId ?? "nonexistent-user-id";
  console.log(`测试用户 A=${userA} (${owners[0].n} chunks)`);
  console.log(`对照用户 B=${userB}\n`);

  // ============================================================
  console.log("① 写入路径（::vector 参数）");
  // ============================================================
  const probeId = randomUUID();
  const probeVec = await embedText("这是一条 pgvector 写入验证用的探测文本");
  check("embedText 返回 1024 维", probeVec.length === 1024, `实际 ${probeVec.length}`);

  await prisma.$executeRawUnsafe(
    `INSERT INTO documentchunk (id, "userId", "sourceName", "sourceType", "chunkIndex", content, embedding, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
    probeId, userA, "verify-pgvector-probe.md", "text", 0,
    "这是一条 pgvector 写入验证用的探测文本", toPgVector(probeVec), new Date()
  );
  check("INSERT ... $7::vector 成功", true);

  // ============================================================
  console.log("\n② 检索路径（searchKnowledge）");
  // ============================================================
  const res = await searchKnowledge("pgvector 写入验证", userA, 5);
  check("返回了结果", res.results.length > 0, `${res.results.length} 条`);
  check("searchedChunks 是全量而非 1000 上限", res.searchedChunks === owners[0].n + 1,
    `searchedChunks=${res.searchedChunks}, 实际总数=${owners[0].n + 1}`);

  const scores = res.results.map((r) => r.score);
  const descending = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
  check("score 按降序排列", descending, scores.map((s) => s.toFixed(3)).join(" > "));
  check("score 是余弦相似度（落在 [-1,1]）", scores.every((s) => s >= -1.001 && s <= 1.001));
  check("最相关的是刚插入的探测文本",
    res.results[0]?.content.includes("pgvector 写入验证"),
    `top1 来自 ${res.results[0]?.sourceName}`);

  // ============================================================
  console.log("\n③ 数据隔离（跨 userId）");
  // ============================================================
  const other = await searchKnowledge("pgvector 写入验证", userB, 5);
  const leaked = other.results.some((r) => r.sourceName === "verify-pgvector-probe.md");
  check("用户 B 查不到用户 A 的探测 chunk", !leaked,
    `B 返回 ${other.results.length} 条，均属 B`);

  // ============================================================
  console.log("\n④ 长期记忆检索（getRelevantMemories）");
  // ============================================================
  const memOwner = await prisma.$queryRawUnsafe<Array<{ userId: string; n: number }>>(
    `SELECT "userId", COUNT(*)::int AS n FROM usermemory WHERE embedding IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`
  );
  if (memOwner.length > 0) {
    const mems = await getRelevantMemories(memOwner[0].userId, 5, "学习 React 前端");
    check("向量路径返回了记忆", mems.length > 0, `${mems.length} 条`);
    check("返回条数不超过 limit", mems.length <= 5);
  } else {
    console.log("  ⏭  本地库无带向量的记忆，跳过");
  }

  // ============================================================
  console.log("\n⑤ 清理探测数据");
  // ============================================================
  await prisma.$executeRawUnsafe(`DELETE FROM documentchunk WHERE id = $1`, probeId);
  const left = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM documentchunk WHERE id = $1`, probeId
  );
  check("探测数据已清理", left[0].n === 0);

  console.log(`\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"} — ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ 验证脚本异常:", err);
  process.exit(1);
});
