/* ============================================================
 * 向量维度归一化：把维度不符的历史向量重新 embedding 到契约维度
 *
 * 用法:  tsx scripts/normalize-embeddings.ts [--dry]
 * 本地:  直接跑（读 .env 的 DATABASE_URL）
 * 服务器: docker exec summer-checkin-app node node_modules/tsx/dist/cli.mjs \
 *           /app/scripts/normalize-embeddings.ts
 *
 * 背景
 *   向量维度长期不是稳定契约——项目历史上换过三次向量模型，库里因此留下了
 *   不同维度的数据（本地库实测：1536 维 91 条、512 维 25 条；生产库恰好
 *   全是 1024）。在 jsonb 时代这不会报错，代价是那些向量因长度不等而余弦
 *   恒返回 0，静默地永远检索不到。
 *
 *   迁移到 vector(1024) 之前必须先归一化，否则 ALTER TABLE 会直接失败：
 *     ERROR: expected 1024 dimensions, not 1536
 *
 * 必须在下述状态运行
 *   embedding 列仍是 jsonb。已迁移成 vector 后本脚本会拒绝执行
 *   （那时维度问题已在写入侧被 model-pool 的维度守卫拦住）。
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { PrismaClient } from "../src/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** 与 embedTexts 的分批大小一致（DashScope 单次 batch 上限 10） */
const BATCH_SIZE = 10;

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  // ⚠️ 必须动态 import：ESM 的 import 语句会被提升到模块顶部，先于上面的
  // loadEnv() 求值。而 model-pool 的 PROVIDER_CONFIG 是在模块初始化时就读
  // process.env 的——静态引入会拿到空的 API key，报「embedding 档无可用的模型」。
  const { embeddingWithFallback, EMBEDDING_DIMENSION } = await import("../src/lib/model-pool");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log(`目标维度: ${EMBEDDING_DIMENSION}${DRY_RUN ? "（--dry，只统计不写入）" : ""}\n`);

  // 前置检查：必须在 jsonb 状态运行
  const col = await prisma.$queryRawUnsafe<Array<{ data_type: string }>>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'documentchunk' AND column_name = 'embedding'`
  );
  if (col[0]?.data_type !== "jsonb") {
    console.error(
      `❌ embedding 列当前是 "${col[0]?.data_type}"，本脚本只应在迁移前的 jsonb 状态运行。`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  let grandTotal = 0;

  for (const table of ["documentchunk", "usermemory"] as const) {
    // table 来自上面的字面量联合类型，非用户输入，无注入面
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; dim: number }>
    >(
      `SELECT id, content, jsonb_array_length(embedding) AS dim
       FROM ${table}
       WHERE embedding IS NOT NULL AND jsonb_array_length(embedding) <> $1
       ORDER BY id`,
      EMBEDDING_DIMENSION
    );

    if (rows.length === 0) {
      console.log(`[${table}] ✅ 无需归一化`);
      continue;
    }

    const byDim = rows.reduce<Record<number, number>>((acc, r) => {
      acc[r.dim] = (acc[r.dim] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `[${table}] 需归一化 ${rows.length} 条 → ${Object.entries(byDim)
        .map(([d, n]) => `${d}维×${n}`)
        .join(", ")}`
    );
    grandTotal += rows.length;

    if (DRY_RUN) continue;

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, model } = await embeddingWithFallback(batch.map((r) => r.content));

      for (let j = 0; j < batch.length; j++) {
        await prisma.$executeRawUnsafe(
          `UPDATE ${table} SET embedding = $1::jsonb WHERE id = $2`,
          JSON.stringify(data[j]),
          batch[j].id
        );
      }
      done += batch.length;
      console.log(`  ${done}/${rows.length}（最近一批 model=${model}）`);
    }
  }

  console.log(
    grandTotal === 0
      ? "\n✅ 全部已是契约维度，无需处理"
      : `\n✅ 归一化完成，共 ${grandTotal} 条`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ 归一化失败:", err);
  process.exit(1);
});
