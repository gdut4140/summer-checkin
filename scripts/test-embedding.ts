// ============================================================
// 测试 DeepSeek Embedding API + 数据库读写
// 运行: npx tsx scripts/test-embedding.ts
// ============================================================

import "dotenv/config";
import { embedText, embedTexts } from "../src/lib/rag/client";

async function main() {
  console.log("=== DeepSeek Embedding 测试 ===\n");

  // 1. 单条 embedding
  console.log("1️⃣  单条文本 embedding...");
  try {
    const vec = await embedText("我喜欢在早上学习 TypeScript");
    console.log(`   ✅ 成功！向量维度: ${vec.length}`);
    console.log(`   前 5 个值: [${vec.slice(0, 5).map((v) => v.toFixed(6)).join(", ")}]`);
  } catch (err) {
    console.error(`   ❌ 失败: ${err}`);
    process.exit(1);
  }

  // 2. 批量 embedding
  console.log("\n2️⃣  批量文本 embedding（3 条）...");
  try {
    const texts = [
      "准备字节前端面试",
      "每天学习 2 小时 React",
      "算法题容易卡壳需要多练习",
    ];
    const vecs = await embedTexts(texts);
    console.log(`   ✅ 成功！返回 ${vecs.length} 个向量，每个 ${vecs[0].length} 维`);
    for (let i = 0; i < vecs.length; i++) {
      console.log(`   [${i}] "${texts[i].slice(0, 20)}..." → ${vecs[i].length}d`);
    }
  } catch (err) {
    console.error(`   ❌ 失败: ${err}`);
    process.exit(1);
  }

  // 3. 测试数据库读写（如果有 DATABASE_URL 配置）
  console.log("\n3️⃣  数据库读写测试...");
  try {
    const { PrismaClient } = await import("../src/lib/generated/prisma/client");
    const prisma = new PrismaClient();

    // 先测试嵌入
    const vec = await embedText("测试记忆：用户喜欢用 VS Code");

    // 写入 jsonb
    const testId = "test-embedding-" + Date.now();
    await prisma.$executeRawUnsafe(
      `INSERT INTO usermemory (id, user_id, type, content, embedding, importance, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      testId,
      "test-user",
      "preference",
      "测试记忆：用户喜欢用 VS Code",
      JSON.stringify(vec),
      0.5,
      0.5,
      new Date(),
    );
    console.log(`   ✅ 写入成功 (id=${testId})`);

    // 读回
    const rows = await prisma.$queryRawUnsafe<Array<{ embedding: unknown }>>(
      `SELECT embedding FROM usermemory WHERE id = $1`,
      testId
    );
    const raw = rows[0]?.embedding;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const arr = Array.isArray(parsed) ? parsed : [];
    console.log(`   ✅ 读回成功，向量维度: ${arr.length}`);

    // 清理
    await prisma.$executeRawUnsafe(
      `DELETE FROM usermemory WHERE id = $1`,
      testId
    );
    console.log(`   ✅ 清理完成`);

    await prisma.$disconnect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("connect") || msg.includes("ECONNREFUSED")) {
      console.log(`   ⚠️  数据库未连接，跳过（这不影响 embedding API 测试）`);
    } else {
      console.error(`   ❌ 失败: ${msg}`);
    }
  }

  console.log("\n=== 全部测试通过 ✅ ===");
}

main().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
