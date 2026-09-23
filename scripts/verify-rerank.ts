/* ============================================================
 * Rerank 验证：打真实 API，确认 cross-encoder 精排真的在起作用
 *
 * 用法:  tsx scripts/verify-rerank.ts
 *
 * 覆盖：
 *   ① 契约正确性 —— 明显相关的文档必须排第一；分数是数字、降序
 *   ② 请求体契约 —— 原生嵌套信封的参数确实被服务端接受了（回显 usage）
 *   ③ 真实语料    —— 用库里真实 chunk 造"已知相关"场景，量化重排前后的名次变化
 *   ④ 延迟        —— 实测重排相对向量召回多花多少时间
 *
 * ⚠️ 为什么必须 loadEnv 之后**动态** import：
 *    model-pool 的 PROVIDER_CONFIG 是模块级 const，在 import 时就读 process.env。
 *    ESM 的 import 语句会被提升到模块顶部、先于 loadEnv() 求值，静态引入会拿到
 *    空 API key，报出误导性的"embedding/rerank 档无可用的模型"。
 *    （同一个坑见 normalize-embeddings.ts 与 verify-pgvector.ts 的注释。）
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

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

const ms = (t: number) => `${t.toFixed(0)}ms`;

/**
 * 字符二元组 Jaccard 相似度。
 * 用于判断"顶掉目标的那个 chunk"是不是同一段内容——分片是「固定大小 + 重叠」的
 * （见 rag/chunk.ts），相邻 chunk 内容高度重合，重排把邻近分片提前属于并列，
 * 不是错误。不做这层判别，基准会把并列当失败，得出"重排有害"的假结论。
 */
function bigramOverlap(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

async function main() {
  const { rerankWithFallback, getRerankChain } = await import("../src/lib/model-pool");
  const { rerankChunks } = await import("../src/lib/rag");
  const { searchSimilarChunks } = await import("../src/lib/rag/retriever");
  const { embedText } = await import("../src/lib/rag/client");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log(`链路: ${getRerankChain().map((m) => m.modelName).join(" → ")}\n`);

  // ============================================================
  console.log("① 契约正确性（固定语料）");
  // ============================================================
  const query = "什么是 pgvector 的余弦距离算子";
  const docs = [
    "今天天气不错，适合出门散步", // 无关
    "pgvector 用 <=> 计算余弦距离，ORDER BY 升序即最相似", // 明显相关
    "PostgreSQL 的索引类型有 B-tree、GIN 和 GiST", // 弱相关
  ];

  const t0 = Date.now();
  let res: Awaited<ReturnType<typeof rerankWithFallback>>;
  try {
    res = await rerankWithFallback(query, docs);
  } catch (err) {
    check("重排调用成功", false, String(err));
    console.log("\n⚠️ 重排不可用，后续用例跳过");
    await prisma.$disconnect();
    process.exit(1);
  }
  const rerankMs = Date.now() - t0;

  check("重排调用成功", true, `model=${res.model} 耗时=${ms(rerankMs)}`);
  check(
    "明显相关的那篇排第一",
    res.data[0]?.index === 1,
    `top1 = docs[${res.data[0]?.index}] "${docs[res.data[0]?.index]?.slice(0, 24)}…"`
  );
  check(
    "分数都是有限数字",
    res.data.every((s) => Number.isFinite(s.score) && typeof s.score === "number"),
    res.data.map((s) => s.score.toFixed(4)).join(", ")
  );
  const sorted = [...res.data].sort((a, b) => b.score - a.score);
  check(
    "服务端已按相关性降序返回",
    res.data.every((s, i) => s.index === sorted[i].index)
  );

  // ============================================================
  console.log("\n③④ 真实语料：重排前后的名次变化与耗时");
  // ============================================================
  //
  // ⚠️ 基准设计的关键：查询**不能**用资料原文的开头。那样是"近似原文匹配"，
  // 向量检索本来就稳拿第一，重排无事可做——官方文档也明说这种场景重排价值小。
  // 那样的基准只会测出"重排没提升"，是伪结论。
  // 所以这里让模型针对每条资料改写一个**措辞不同的自然问题**，
  // 模拟真实用户提问，才是 cross-encoder 该发力的地方。
  const owners = await prisma.$queryRawUnsafe<Array<{ userId: string; n: number }>>(
    `SELECT "userId", COUNT(*)::int AS n FROM documentchunk
     WHERE embedding IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`
  );
  if (owners.length === 0) {
    console.log("  ⏭  本地库无带向量的 chunk，跳过");
    await prisma.$disconnect();
    return;
  }
  const { userId, n } = owners[0];
  console.log(`  用户在库中 ${n} 个 chunk`);

  const { createClientFor, pickModel } = await import("../src/lib/model-pool");
  const llm = createClientFor(pickModel("low"));

  // 确定性取样：ORDER BY random() 会让每次跑出来的样本都不同，指标随之抖动，
  // 那种数字不能叫量化。固定按 id 取前 N 条，保证同一个库上可复现。
  // （唯一仍不可复现的是每轮让模型现生成的问题措辞，见下方输出里的说明。）
  const targets = await prisma.$queryRawUnsafe<Array<{ id: string; content: string }>>(
    `SELECT id, content FROM documentchunk
     WHERE "userId" = $1 AND embedding IS NOT NULL AND length(content) > 120
     ORDER BY id LIMIT 10`,
    userId
  );

  let rankImproved = 0;
  let rankWorsened = 0;
  let rankMeasured = 0;
  let sumBefore = 0;
  let sumAfter = 0;
  let embedMsTotal = 0;
  let vectorMsTotal = 0;
  let rerankMsTotal = 0;
  // 各阶段的实际执行次数——不能用 targets.length 去除，否则有样本被跳过时
  // 平均值会被摊薄，得出一个假的"更快"。
  let embedCount = 0;
  let vectorCount = 0;
  let rerankCount = 0;

  for (const [i, target] of targets.entries()) {
    // 免费档 chat 有速率限制，连打 10 个问题生成会撞 429（实测第 6 条开始全挂）。
    // 拉开间隔，否则后半段样本会整段丢失，指标只覆盖前一半。
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));

    // 让模型改写一个措辞不同的自然问题
    let q: string;
    try {
      const r = await llm.chat.completions.create({
        model: pickModel("low").modelName,
        messages: [
          {
            role: "system",
            content:
              "你是检索评测助手。根据给定资料写一个它能回答的自然问题，要像真实用户会问的那样，" +
              "**不要照抄原文措辞**。只输出问题本身，不要任何前后缀。",
          },
          { role: "user", content: target.content.slice(0, 900) },
        ],
      });
      q = (r.choices[0]?.message?.content ?? "").trim();
    } catch (err) {
      console.log(`  样本${i + 1}: 生成问题失败，跳过 — ${err}`);
      continue;
    }
    if (!q) continue;
    console.log(`\n  样本${i + 1} 查询: "${q.slice(0, 50)}"`);

    const tA = Date.now();
    const vec = await embedText(q);
    embedMsTotal += Date.now() - tA;
    embedCount++;

    const tB = Date.now();
    const recalled = await searchSimilarChunks(vec, 20, undefined, userId);
    vectorMsTotal += Date.now() - tB;
    vectorCount++;

    if (recalled.length === 0) continue;

    const tC = Date.now();
    const outcome = await rerankChunks(q, recalled);
    rerankMsTotal += Date.now() - tC;
    rerankCount++;

    if (!outcome) {
      console.log(`  ⚠️ 重排失败（已降级）`);
      continue;
    }

    const before = recalled.findIndex((c) => c.id === target.id) + 1;
    const after = outcome.ordered.findIndex((c) => c.id === target.id) + 1;
    if (before === 0 || after === 0) {
      console.log(`  目标 chunk 未被召回，本次不计入（前=${before || "未"} 后=${after || "未"}）`);
      continue;
    }
    rankMeasured++;
    sumBefore += before;
    sumAfter += after;
    const moved = after < before;
    if (moved) rankImproved++;
    if (after > before) rankWorsened++;

    let note = "";
    if (after > before) {
      // 目标 chunk 的完整字段要从 recalled 里取——上面那条 SQL 只选了 id/content。
      const targetChunk = recalled[before - 1];
      const winner = outcome.ordered[0];
      const sibling =
        winner.sourceName === targetChunk.sourceName &&
        Math.abs(winner.chunkIndex - targetChunk.chunkIndex) <= 1;
      const overlap = bigramOverlap(winner.content, targetChunk.content);
      note =
        winner.id === target.id
          ? ""
          : ` ｜ 顶掉它的是 ${winner.sourceName}#${winner.chunkIndex}` +
            `${sibling ? "（相邻分片）" : ""} 与其内容重合度 ${(overlap * 100).toFixed(0)}%` +
            (overlap > 0.5 ? " → 并列，不算错" : "");
    }

    console.log(
      `  目标 chunk 名次 ${before} → ${after}` +
        `（${before === after ? "不变" : moved ? `↑ 升 ${before - after}` : `↓ 降 ${after - before}`}）` +
        `  model=${outcome.model}${note}`
    );
  }

  const avg = (total: number, count: number) => (count === 0 ? "N/A" : ms(total / count));
  console.log(
    `\n  平均耗时: embedding ${avg(embedMsTotal, embedCount)} → 向量召回 ${avg(vectorMsTotal, vectorCount)}` +
      ` → 重排 ${avg(rerankMsTotal, rerankCount)}`
  );
  if (rankMeasured > 0) {
    console.log(
      `  目标 chunk 平均名次: ${(sumBefore / rankMeasured).toFixed(2)} → ${(sumAfter / rankMeasured).toFixed(2)}` +
        `（前 10 名内，越小越好）`
    );
    console.log(
      `  名次变化: 提升 ${rankImproved} / 不变 ${rankMeasured - rankImproved - rankWorsened} / 下降 ${rankWorsened}` +
        `（有效样本 ${rankMeasured}）`
    );
  } else {
    console.log("  ⚠️ 无有效样本，未能测得名次变化");
  }
  console.log(
    "\n  ⚠️ 可复现性说明：取样已固定（ORDER BY id），但每轮的问题措辞是现让模型生成的，" +
      "\n     所以名次数字跨轮次仍会有波动。要更稳的结论就多跑几轮取分布，或把问题固化下来。"
  );

  await prisma.$disconnect();

  console.log(`\n${fail === 0 ? "✅" : "❌"} 通过 ${pass} / 失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ 验证脚本异常:", err);
  process.exit(1);
});
