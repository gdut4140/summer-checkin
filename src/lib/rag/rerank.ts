// ============================================================
// RAG 重排（cross-encoder 精排）
//
// 在向量召回之后、返回结果之前，用真正的 cross-encoder 对候选重新打分。
//
// 与项目里曾被删除的那个「重排」的区别（这点必须说清楚，否则会被误判为同一个东西）：
//   · 被删的版本：把候选重新 embedding 一遍、再算一遍**同样的余弦**。同模型、同公式、
//     同候选集——确定性函数重复应用不可能改变排序，是纯数学空转，还白烧一批 API 调用。
//   · 本实现：cross-encoder 把 query 和 document **联合编码**（两段文本之间有 attention），
//     打分不是两个 embedding 的函数，因此**无法由余弦序推导出来**。这是质的不同。
//
// 传输层在 model-pool 的 rerankWithFallback（链选择 + 降级 + 错误分类归它管）；
// 本模块只负责编排：裁剪、排序、以及失败时如何降级。
// ============================================================

import { rerankWithFallback, isQuotaError, type RerankScore } from "@/lib/model-pool";
import type { DocChunk } from "./retriever";

/**
 * 单篇文档送入重排的最大字符数。
 * qwen3-rerank 单篇上限 4000 token，中文约 1.5 字/token，取 3000 字留足余量。
 * 实际 chunk 默认 500 字（见 chunk.ts），这个上限正常永远不触发——
 * 它存在的意义是让将来调大分片时不会变成线上 400。
 */
const MAX_DOC_CHARS = 3000;

/** 单次送入重排的最大文档数（官方上限 500，这里按召回池规模收紧） */
const MAX_DOC_COUNT = 50;

/**
 * 进程内熔断标志。
 *
 * 额度类失败是暂时的、也该逐次重试；但**形状/协议类错误会稳定复现**，
 * 每次都必然失败——不关掉的话，此后每次搜索都白付一次注定失败的往返。
 * 与 model-pool 里的 exhaustedModels 同一思路，同样的局限：进程重启即失效。
 */
let rerankDisabled = false;

/** 仅测试用：复位熔断标志 */
export function __resetRerankDisabled(): void {
  rerankDisabled = false;
}

/**
 * 裁剪送检文档（纯函数）
 *
 * 官方 token 上限公式是 `查询token × 文档数 + 文档token总和`，qwen3-rerank 单请求 12 万。
 * 召回 20 × 500 字 ≈ 2.4 万，余量充足；但 searchKnowledge 的公开签名允许传很大的 topK，
 * 会把上限击穿成 400 并杀掉整条链。这里兜住。
 */
export function clampRerankDocuments(
  documents: string[],
  maxCount = MAX_DOC_COUNT,
  maxChars = MAX_DOC_CHARS
): { docs: string[]; truncatedCount: number; truncatedChars: number } {
  const kept = documents.slice(0, maxCount);
  const truncatedCount = documents.length - kept.length;
  let truncatedChars = 0;

  const docs = kept.map((d) => {
    if (d.length <= maxChars) return d;
    truncatedChars++;
    return d.slice(0, maxChars);
  });

  if (truncatedCount > 0 || truncatedChars > 0) {
    console.warn(
      `[rerank] 输入被裁剪：丢弃 ${truncatedCount} 篇超量文档、截断 ${truncatedChars} 篇超长文档`
    );
  }
  return { docs, truncatedCount, truncatedChars };
}

/**
 * 按重排分数重排候选（纯函数）
 *
 * 三条刻意的设计：
 *  1. **同分回落到原始向量序**——否则排序不确定，`verify-pgvector.ts` 的降序断言
 *     会变成随机红灯，那种间歇性失败最费时间。
 *  2. **没拿到分数的候选追加在尾部，不丢弃**——丢弃会把一次重排抖动变成上下文缺失。
 *  3. 不修改入参数组。
 */
export function orderByRerank(candidates: DocChunk[], scores: RerankScore[]): DocChunk[] {
  const scoreByIndex = new Map(scores.map((s) => [s.index, s.score]));
  const scored: Array<{ chunk: DocChunk; score: number; originalIndex: number }> = [];
  const unscored: DocChunk[] = [];

  candidates.forEach((chunk, originalIndex) => {
    const score = scoreByIndex.get(originalIndex);
    if (score === undefined) unscored.push(chunk);
    else scored.push({ chunk, score, originalIndex });
  });

  scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

  return [...scored.map((x) => x.chunk), ...unscored];
}

/** 是否为超时类错误。超时是暂时性网络问题，不该触发熔断 */
function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return /aborted due to timeout|timeout/i.test(err instanceof Error ? err.message : String(err));
}

export interface RerankOutcome {
  ordered: DocChunk[];
  model: string;
  /**
   * chunk.id → 重排分。
   * 单独回传而不是塞进 DocChunk：`similarity` 是余弦、这里是 cross-encoder 分，
   * 两者不同量纲，混进同一个字段就是范畴错误。没分到分的 chunk 不在表里。
   */
  scoreById: Map<string, number>;
}

/**
 * 对候选做 cross-encoder 重排
 *
 * **失败一律返回 null**，由调用方降级为向量序——重排是质量增强，不是正确性要求，
 * 绝不能让它把知识库搜索搞挂（对齐 memory.ts 里"向量搜索失败就回退混合评分"的既有写法）。
 */
export async function rerankChunks(
  query: string,
  candidates: DocChunk[]
): Promise<RerankOutcome | null> {
  if (rerankDisabled) return null;
  if (candidates.length === 0) return null;

  const { docs } = clampRerankDocuments(candidates.map((c) => c.content));

  try {
    // topN 不传 → 由 model-pool 传满（documents.length），拿回完整排列再本地截断
    const { data, model } = await rerankWithFallback(query, docs);

    // clamp 是前缀截取（slice(0, maxCount)），所以 docs[i] === candidates[i].content，
    // 服务端按 docs 下标返回的 index 与 candidates 下标天然对齐，不需要任何偏移。
    // 超出 maxCount 的候选压根没送检，自然不在 data 里，会由 orderByRerank 追加到尾部。
    const scoreById = new Map<string, number>();
    for (const s of data) {
      const chunk = candidates[s.index];
      if (chunk) scoreById.set(chunk.id, s.score);
    }

    return { ordered: orderByRerank(candidates, data), model, scoreById };
  } catch (err) {
    if (isQuotaError(err)) {
      // 额度/限流：暂时性，逐次重试即可，不熔断
      console.warn("[rerank] 额度或限流问题，本次退化为向量序:", err);
    } else if (isTimeoutError(err)) {
      // 超时：单次网络抖动，不熔断
      console.warn("[rerank] 请求超时，本次退化为向量序:", err);
    } else {
      // 形状/协议/参数类错误会稳定复现，熔断以免每次搜索都白付一次往返
      rerankDisabled = true;
      console.error("[rerank] 非暂时性错误，本进程内关闭重排（退化为向量序）:", err);
    }
    return null;
  }
}
