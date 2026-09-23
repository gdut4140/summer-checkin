import OpenAI from "openai";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, toTextStream, type LanguageModel } from "ai";
import { assertInteractiveUsageAllowed, recordUsage } from "@/lib/usage";

// ============================================================
// 模型池（Model Pool）
//
// 背景：阿里云百炼每个模型独立 100 万 token 免费额度（仅华北2北京生效），
// 免费额度耗尽返回 403 AllocationQuota.FreeTierOnly，需要自动降级到池内下一个模型。
// model 必须传「完整原始模型字符串」，禁止简写（简写会调用 latest 版本，扣另一套额度）。
//
// 分档：
// - LOW  ：聊天室 / 标题生成 / 记忆提取 / 计划拆分 —— agnes-2.5-flash 免费优先，额度用完降级阿里云 flash。
// - HIGH ：agent / 文档 studio / 后台规划 —— agnes-2.5-flash 免费优先，不可用/额度耗尽降级阿里云。
// ============================================================

export type ModelProvider = "agnes" | "aliyun";
export type ModelTier = "low" | "high";
export type ModelType =
  | "general"
  | "reasoning"
  | "code"
  | "math"
  | "vl"
  | "ocr"
  | "translate"
  | "special"
  | "embedding"
  | "rerank";

export interface ModelEntry {
  /** 完整原始模型字符串，调用时原样传递，禁止简写 */
  modelName: string;
  displayName: string;
  provider: ModelProvider;
  modelType: ModelType;
  /** 思考类模型（带 -thinking / deepseek-r1 / qvq），需 enable_thinking */
  thinking?: boolean;
  tier: ModelTier;
  /** 免费额度到期（元信息，不参与逻辑；实际以 403 为准） */
  freeQuotaEnd?: string;
  /** 免费额度已用完（人工标记，见「阿里云大语言模型.txt」额度盘点；调用前直接跳过，不再试 403） */
  exhausted?: boolean;
}

const PROVIDER_CONFIG: Record<ModelProvider, { baseURL: string; apiKey: string }> = {
  agnes: {
    baseURL:
      process.env.AGNES_BASE_URL ??
      process.env.DASHSCOPE_BASE_URL ??
      "https://api.agnes-ai.cn/v1",
    apiKey: process.env.AGNES_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "",
  },
  aliyun: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 现有项目里 EMBEDDING_API_KEY 就是阿里百炼 key（知识库 embedding 一直在用），可复用
    apiKey: process.env.ALIYUN_API_KEY ?? process.env.EMBEDDING_API_KEY ?? "",
  },
};

// ── rerank 接入点 ──
//
// ⚠️ 不能从 PROVIDER_CONFIG.baseURL 推导。重排不在 compatible-mode 路径下：
//    · 原生  POST /api/v1/services/rerank/text-rerank/text-rerank
//    · 兼容  POST /compatible-api/v1/reranks（是 compatible-**api**，不是 -mode）
// 2026-09-23 实测：原生与兼容都返回 200；用 compatible-mode/v1/reranks 则 404。
//
// 官方两份文档在这里是矛盾的——help.aliyun.com 给 qwen3-rerank 的是扁平体，
// API 参考页却写着 "nested request structure with input and parameters"。
// 真相是两条不同路由、两种信封，社区里 LightRAG / AstrBot / OpenViking 都在这上面
// 踩过"rerank 静默失效"。所以请求按配置走确定的一条，解析两种信封都收（见
// parseRerankResponse）——端点选错时退化成"分数正确"而不是"全是 0 的原序"。
export type RerankProtocol = "dashscope-native" | "openai-compatible";

interface RerankEndpoint {
  endpoint: string;
  protocol: RerankProtocol;
}

/** 用 Partial：缺配置即视为该 provider 不支持 rerank（与 apiKey 缺失同一种处理） */
const RERANK_CONFIG: Partial<Record<ModelProvider, RerankEndpoint>> = {
  aliyun: {
    endpoint: "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    protocol: "dashscope-native",
  },
  // agnes 无重排能力，故不配
};

/** 单次重排请求超时。裸 fetch 默认无超时，工具调用路径不能无限挂着 */
const RERANK_TIMEOUT_MS = 8000;

// ── HIGH 档（agent / 文档 studio / 后台规划）：agnes 免费优先，不可用/额度耗尽降级阿里云 ──
const HIGH_CHAIN: ModelEntry[] = [
  // 免费优先（agnes）
  { modelName: "agnes-2.5-flash", displayName: "Agnes 2.5 Flash", provider: "agnes", modelType: "general", tier: "high" },

  // 阿里云百炼：每个快照独立免费额度，按强度从高到低排队，403 后自动降级下一个
  { modelName: "qwen3.8-max", displayName: "通义千问 3.8 Max", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-max-preview", displayName: "通义千问 3.7 Max Preview", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-max-2026-05-20", displayName: "通义千问 3.7 Max (05-20)", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.6-max-preview", displayName: "通义千问 3.6 Max Preview", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "deepseek-v3.1", displayName: "DeepSeek V3.1", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "glm-5.2", displayName: "GLM-5.2", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "kimi-k2.6", displayName: "Kimi K2.6", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.6-plus", displayName: "通义千问 3.6 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.5-plus-2026-02-15", displayName: "通义千问 3.5 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },

  // 已用完（免费额度耗尽，403 后不再恢复；保留记录便于查账，exhausted=true 直接跳过）
  { modelName: "qwen3.7-max-2026-06-08", displayName: "通义千问 3.7 Max", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "deepseek-v4-pro-0813", displayName: "DeepSeek V4 Pro", provider: "aliyun", modelType: "general", thinking: true, tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "qwen3-max-2026-01-23", displayName: "通义千问 3 Max", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "qwen3.7-plus-2026-05-26", displayName: "通义千问 3.7 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "deepseek-v3.2", displayName: "DeepSeek V3.2", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "qwen3.5-plus-2026-04-20", displayName: "通义千问 3.5 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
  { modelName: "qwen-plus-2025-12-01", displayName: "通义千问 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07", exhausted: true },
];

// ── LOW 档（聊天室/标题/记忆/拆任务）：agnes 免费优先，额度用完降级阿里云 flash ──
const LOW_CHAIN: ModelEntry[] = [
  { modelName: "agnes-2.5-flash", displayName: "Agnes 2.5 Flash", provider: "agnes", modelType: "general", tier: "low" },
  { modelName: "qwen-flash-2025-07-28", displayName: "通义千问 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-flash-2026-07-15", displayName: "通义千问 3.7 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.6-flash", displayName: "通义千问 3.6 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen-turbo", displayName: "通义千问 Turbo", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
];

// ── Embedding 档（知识库 / memory 向量化）：不计入用户 token 精力条 ──
// 阿里云百炼文本向量（额度参考「阿里云向量模型.txt」）
//
// ⚠️ 维度契约：向量列是 vector(1024)，链上每个模型的输出维度必须都是 1024。
// 2026-09-22 实测：
//   text-embedding-v4 → 1024 ✅
//   text-embedding-v3 → 1024 ✅
//   text-embedding-v2 → 1536 ❌ 且【直接忽略 dimensions 参数】，物理上做不到 1024
//   text-embedding-v1 → 1536 ❌
//
// 原先的兜底是 v2，它会把 1536 维向量写进库里。在 jsonb 时代这不会报错——
// 只是那些向量因长度不等而余弦恒返回 0，静默地永远检索不到（本地库实测有
// 116 条 1536/512 维的遗留数据，来源就是历史上换过三次向量模型）。
// 改用维度兼容的 v3 兜底。
export const EMBEDDING_DIMENSION = 1024;

const EMBEDDING_CHAIN: ModelEntry[] = [
  { modelName: "text-embedding-v4", displayName: "通义向量 v4", provider: "aliyun", modelType: "embedding", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "text-embedding-v3", displayName: "通义向量 v3", provider: "aliyun", modelType: "embedding", tier: "low", freeQuotaEnd: "2026-11-07" },
];

// ── Rerank 档（知识库召回后的 cross-encoder 精排）：不计入用户 token 精力条 ──
//
// tier 标 "low" 只是占位，与 embedding 档同理——rerank 条目不进 HIGH/LOW_CHAIN，
// getChain() 的 `tier === "high" ? HIGH : LOW` 三元式在结构上就排除了它们。
//
// 这是**真 cross-encoder**：query 与 document 联合编码（两段文本之间有 attention），
// 打分不是两个 embedding 的函数，因此无法由向量的余弦序推导出来。
// 项目里曾经有过一个"重排"，是把候选重新 embedding 一遍再算同样的余弦——同模型、
// 同公式、同候选集，确定性函数不可能改变排序，纯属数学空转，已删除。两者不是一回事。
//
// ⚠️ 2026-09-23 实测的额度与可用性：
//   qwen3-rerank          200 ✅  区分度好（相关 0.943 / 无关 0.344、0.141）
//   qwen3.7-text-rerank   200 ✅  区分度更好（0.950 / 0.138 / 0.0006）
//   gte-rerank-v2         200 ⚠️  官方公告称 2026-05-30 停服，但实测仍可用。
//                                 不用它：文档已判死、单请求 token 上限只有 3 万（另两个是 12 万）。
//
// 限制（官方文档）：单请求最多 500 篇文档，单篇最长 4000 token（qwen3.7 为 30000），
// 单请求总量上限 120000 token，公式 = 查询token × 文档数 + 文档token总和。
const RERANK_CHAIN: ModelEntry[] = [
  { modelName: "qwen3-rerank", displayName: "通义千问3 重排", provider: "aliyun", modelType: "rerank", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-text-rerank", displayName: "通义千问3.7 文本重排", provider: "aliyun", modelType: "rerank", tier: "low", freeQuotaEnd: "2026-11-30" },
];

/** 已耗尽模型（进程内记忆：403 后加入，本进程不再重试） */
const exhaustedModels = new Set<string>();

/** 临时限流模型（429/rate limit）：冷却到期前跳过，到期后自动恢复 */
const rateLimitedUntil = new Map<string, number>();

export function markModelExhausted(modelName: string): void {
  exhaustedModels.add(modelName);
}

/** 标记限流冷却（默认 60s，避免免费档限流把模型永久禁掉） */
export function markModelRateLimited(modelName: string, cooldownMs = 60_000): void {
  rateLimitedUntil.set(modelName, Date.now() + cooldownMs);
}

/** 模型是否当前可用（未永久耗尽、且不在限流冷却中） */
function isModelAvailable(name: string): boolean {
  if (exhaustedModels.has(name)) return false;
  const until = rateLimitedUntil.get(name);
  if (until === undefined) return true;
  if (Date.now() >= until) {
    rateLimitedUntil.delete(name); // 冷却结束，恢复
    return true;
  }
  return false;
}

/** 是否临时限流错误（429 / rate limit）—— 冷却后恢复，不永久禁用 */
function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || /rate.?limit/i.test(msg);
}

/** 是否余额/免费额度不足类错误（阿里百炼 AllocationQuota.FreeTierOnly、各家的 quota/balance/rate limit/429） */
export function isQuotaError(err: unknown): boolean {
  const match = (msg: string) =>
    msg.includes("AllocationQuota.FreeTierOnly") ||
    msg.includes("InsufficientBalance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("InsufficientQuota") ||
    /\bquota\b/i.test(msg) ||
    /\bbalance\b/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    msg.includes("429");

  const msg = err instanceof Error ? err.message : String(err);
  if (match(msg)) return true;

  // AI SDK 会把原始错误包成 AI_RetryError（内部重试 N 次后才抛）：
  // 顶层 message 可能不含关键字，需深入 lastError / errors 检查
  const wrapped = err as { lastError?: unknown; errors?: unknown[] };
  if (wrapped.lastError !== undefined) {
    const nested = wrapped.lastError instanceof Error ? wrapped.lastError.message : String(wrapped.lastError);
    if (match(nested)) return true;
  }
  if (Array.isArray(wrapped.errors)) {
    for (const sub of wrapped.errors) {
      const nested = sub instanceof Error ? sub.message : String(sub);
      if (match(nested)) return true;
    }
  }
  return false;
}

/** 取某档可用候选链（过滤已耗尽 / 未配置 key 的 provider） */
export function getChain(tier: ModelTier): ModelEntry[] {
  const chain = tier === "high" ? HIGH_CHAIN : LOW_CHAIN;
  return chain.filter((e) => {
    if (e.exhausted) return false; // 人工标记「已用完」：直接跳过，不再试 403
    if (!isModelAvailable(e.modelName)) return false;
    if (!PROVIDER_CONFIG[e.provider].apiKey) return false;
    return true;
  });
}

/** 取某档第一个可用模型 */
export function pickModel(tier: ModelTier): ModelEntry {
  const chain = getChain(tier);
  if (chain.length === 0) {
    throw new Error(`[model-pool] ${tier} 档所有模型均不可用（额度耗尽或未配置 key）`);
  }
  return chain[0];
}

/** 取 embedding 档可用候选链（过滤已耗尽 / 未配置 key 的 provider） */
function getEmbeddingChain(): ModelEntry[] {
  return EMBEDDING_CHAIN.filter((e) => {
    if (e.exhausted) return false; // 人工标记「已用完」：直接跳过
    if (!isModelAvailable(e.modelName)) return false;
    if (!PROVIDER_CONFIG[e.provider].apiKey) return false;
    return true;
  });
}

/** 取 rerank 档可用候选链（多一层：provider 未配置重排接入点的也跳过） */
export function getRerankChain(): ModelEntry[] {
  return RERANK_CHAIN.filter((e) => {
    if (e.exhausted) return false;
    if (!isModelAvailable(e.modelName)) return false;
    if (!PROVIDER_CONFIG[e.provider].apiKey) return false;
    if (!RERANK_CONFIG[e.provider]) return false; // 该 provider 不支持重排
    return true;
  });
}

/** 按模型建原始 OpenAI SDK 客户端 */
export function createClientFor(entry: ModelEntry): OpenAI {
  const { baseURL, apiKey } = PROVIDER_CONFIG[entry.provider];
  if (!apiKey) throw new Error(`[model-pool] ${entry.provider} 未配置 API key`);
  // maxRetries=0：429/403 直接抛给模型池切下一个模型，SDK 不重试已耗尽/限流的模型
  return new OpenAI({ apiKey, baseURL, maxRetries: 0 });
}

/** 按模型建 AI SDK 模型（model 原样传 entry.modelName，禁止简写） */
export function createModelFor(entry: ModelEntry): LanguageModel {
  const { baseURL, apiKey } = PROVIDER_CONFIG[entry.provider];
  if (!apiKey) throw new Error(`[model-pool] ${entry.provider} 未配置 API key`);
  return createOpenAI({ apiKey, baseURL }).chat(entry.modelName);
}

export interface PooledResult<T> {
  data: T;
  model: string;
}

/**
 * 向量化（知识库 / memory embedding）：
 * 按档逐个尝试，额度耗尽自动降级到下一个模型。
 * 注意：不计入用户 token 精力条 —— 不 recordUsage、不 enforce 每日限额。
 */
export async function embeddingWithFallback(
  input: string | string[]
): Promise<PooledResult<number[][]>> {
  const chain = getEmbeddingChain();
  if (chain.length === 0) throw new Error(`[model-pool] embedding 档无可用的模型`);
  let lastErr: unknown;
  for (const entry of chain) {
    try {
      const client = createClientFor(entry);
      const res = await client.embeddings.create({
        model: entry.modelName,
        input,
        // 显式声明维度，不依赖各家默认值——默认值是会变的，契约不能靠运气
        dimensions: EMBEDDING_DIMENSION,
      });
      const sorted = [...res.data].sort((a, b) => a.index - b.index);

      // 维度守卫：维度不符的向量写进 vector(N) 列会整批失败；更隐蔽的是写进
      // jsonb 时静默失效（余弦因长度不等恒返回 0，永远检索不到）。
      // 宁可在这里响亮地失败，也不要让一批查不到的向量悄悄入库。
      const mismatched = sorted.find(
        (item) => item.embedding.length !== EMBEDDING_DIMENSION
      );
      if (mismatched) {
        throw new Error(
          `[model-pool] ${entry.modelName} 返回 ${mismatched.embedding.length} 维，` +
            `与契约维度 ${EMBEDDING_DIMENSION} 不符——该模型与向量列不兼容`
        );
      }

      console.log(
        `[model-pool] embedding 使用 model=${entry.modelName} provider=${entry.provider} dim=${EMBEDDING_DIMENSION}`
      );
      return { data: sorted.map((item) => item.embedding), model: entry.modelName };
    } catch (err) {
      if (isQuotaError(err)) {
        if (isRateLimitError(err)) {
          markModelRateLimited(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 触发限流，冷却 60s 后重试`);
        } else {
          markModelExhausted(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 免费额度耗尽，降级`);
        }
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`[model-pool] embedding 档所有模型请求失败`);
}

// ============================================================
// Rerank（cross-encoder 精排）
// ============================================================

/** 与送入 documents 的下标一一对应。index 是权威身份，不是 document.text */
export interface RerankScore {
  index: number;
  score: number;
}

/**
 * 构造重排请求体（纯函数，导出以便测试）
 *
 * 两条路由的信封不同，而这个差异没有任何类型系统兜底——传错就是 400，
 * 或者被网关静默忽略参数。所以固化成可测的一层。
 */
export function buildRerankBody(
  protocol: RerankProtocol,
  modelName: string,
  query: string,
  documents: string[],
  topN: number,
  instruct?: string
): Record<string, unknown> {
  if (protocol === "dashscope-native") {
    return {
      model: modelName,
      input: { query, documents },
      parameters: {
        // 不返回文档正文：省 token 之外，更要紧的是强制按 index 映射而非按文本映射——
        // 重复内容（同一段落在两个文件里、或分片的重叠窗口）会撞 key，
        // 把一个分数静默映射到两个候选上。
        return_documents: false,
        top_n: topN,
        // 不传时不要留下值为 undefined 的键，否则部分网关会报参数非法
        ...(instruct ? { instruct } : {}),
      },
    };
  }
  // openai-compatible：扁平信封，且没有 return_documents 这个开关
  return {
    model: modelName,
    query,
    documents,
    top_n: topN,
    ...(instruct ? { instruct } : {}),
  };
}

/**
 * 解析重排响应（纯函数，导出以便测试）
 *
 * 两种信封都收：嵌套 `{output:{results:[…]}}`（原生）与扁平 `{results:[…]}`（兼容）。
 * 其余一律抛错——**拿不到合法的 results 数组是错误，不是空列表**。
 *
 * 为什么必须抛而不能退化成 `?? []`：那样调用方就变成"一个分数都没拿到"，排序保持原样
 * （V8 的 sort 在 key 全等时是稳定的），于是输出恰好是向量序、日志还宣称重排已生效——
 * 正好复现项目里被删掉的那个空转重排，而且这次连注释都在撒谎。
 */
export function parseRerankResponse(json: unknown, expectCount: number): RerankScore[] {
  const root = json as { output?: { results?: unknown }; results?: unknown } | null;
  const raw = Array.isArray(root?.output?.results)
    ? root!.output!.results
    : Array.isArray(root?.results)
      ? root!.results
      : null;

  if (raw === null) {
    throw new Error(
      "[model-pool] rerank 响应里找不到 results 数组（output.results 与顶层 results 都没有）" +
        "——端点或协议与响应格式不匹配，拒绝退化为原始顺序"
    );
  }
  if (raw.length === 0) {
    throw new Error(
      "[model-pool] rerank 返回空 results——多为 top_n / documents 参数问题，拒绝退化为原始顺序"
    );
  }

  const scores = raw.map((item, i) => {
    const o = item as { index?: unknown; relevance_score?: unknown };
    if (!Number.isInteger(o.index)) {
      throw new Error(
        `[model-pool] rerank 第 ${i} 项 index 不是整数: ${JSON.stringify(item).slice(0, 120)}`
      );
    }
    if (typeof o.relevance_score !== "number" || !Number.isFinite(o.relevance_score)) {
      throw new Error(
        `[model-pool] rerank 第 ${i} 项 relevance_score 不是有限数: ${JSON.stringify(item).slice(0, 120)}`
      );
    }
    const index = o.index as number;
    if (index < 0 || index >= expectCount) {
      throw new Error(`[model-pool] rerank 返回 index ${index} 越界（本次送入 ${expectCount} 篇）`);
    }
    return { index, score: o.relevance_score as number };
  });

  // 重复 index：同一篇被打两次分，映射回候选会产生重复条目
  if (new Set(scores.map((s) => s.index)).size !== scores.length) {
    throw new Error("[model-pool] rerank 返回了重复的 index");
  }

  // 全部分数相同：合法但可疑（真 cross-encoder 极少打平），只告警不抛
  if (scores.length > 1 && new Set(scores.map((s) => s.score)).size === 1) {
    console.warn(
      `[model-pool] rerank 全部 ${scores.length} 篇得分相同（${scores[0].score}），未改变顺序`
    );
  }

  return scores;
}

/** 单次重排调用（导出以便用 stub fetch 测试降级与错误分类） */
export async function rerankOnce(
  entry: ModelEntry,
  query: string,
  documents: string[],
  topN: number,
  instruct?: string
): Promise<RerankScore[]> {
  const cfg = RERANK_CONFIG[entry.provider];
  if (!cfg) throw new Error(`[model-pool] ${entry.provider} 未配置 rerank 接入点`);
  const apiKey = PROVIDER_CONFIG[entry.provider].apiKey;

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      buildRerankBody(cfg.protocol, entry.modelName, query, documents, topN, instruct)
    ),
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  });

  // ⚠️ 裸 fetch 不会因 4xx/5xx 抛错。必须在这里抛出并带上响应体文本——
  // isQuotaError 要匹配的 AllocationQuota.FreeTierOnly 只存在于 403 的响应体里，
  // 不是异常消息。漏了这一步，模型永远不会被标记 exhausted，于是每次搜索都重试
  // 一个死模型，且零报错零日志。
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[model-pool] rerank ${entry.modelName} HTTP ${res.status}: ${body.slice(0, 500)}`
    );
  }

  return parseRerankResponse(await res.json(), documents.length);
}

/**
 * 重排：按相关性逐模型降级
 *
 * 降级骨架与 embeddingWithFallback 一致（额度类错误切下一个模型，非额度错误立即上抛）。
 * 区别在于 rerank 档只有两个模型，比聊天档的十连降级短得多——所以
 * exhaustedModels / rateLimitedUntil 这两个进程内记忆在这里更吃重：它们是防止
 * 每次搜索都重试死模型的唯一屏障，且随进程重启失效。
 */
export async function rerankWithFallback(
  query: string,
  documents: string[],
  options?: { topN?: number; instruct?: string }
): Promise<PooledResult<RerankScore[]>> {
  if (documents.length === 0) return { data: [], model: "none" };

  const chain = getRerankChain();
  if (chain.length === 0) throw new Error(`[model-pool] rerank 档无可用的模型`);

  // top_n 默认传满：服务端会按它截断，传小值就只能拿到部分分数，
  // 无法区分"完整重排"和"部分重排"。计费与传多少无关。
  const topN = options?.topN ?? documents.length;

  let lastErr: unknown;
  for (const entry of chain) {
    try {
      const data = await rerankOnce(entry, query, documents, topN, options?.instruct);
      console.log(
        `[model-pool] rerank 使用 model=${entry.modelName} provider=${entry.provider} docs=${documents.length}`
      );
      return { data, model: entry.modelName };
    } catch (err) {
      if (isQuotaError(err)) {
        if (isRateLimitError(err)) {
          markModelRateLimited(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 重排触发限流，冷却 60s 后重试`);
        } else {
          markModelExhausted(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 重排免费额度耗尽，降级`);
        }
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`[model-pool] rerank 档所有模型请求失败`);
}

/** 用量上下文：传了就记账；enforce=true（交互式面）超限时抛 UsageLimitError */
export interface UsageContext {
  userId: string;
  surface: string;
  enforce?: boolean;
}

/** 原始 completions：按档逐个尝试，额度耗尽自动降级到下一个模型 */
export async function completionsWithFallback<T>(
  tier: ModelTier,
  fn: (entry: ModelEntry, client: OpenAI, extraBody: Record<string, unknown>) => Promise<T>,
  usage?: UsageContext
): Promise<PooledResult<T>> {
  const chain = getChain(tier);
  if (chain.length === 0) throw new Error(`[model-pool] ${tier} 档无可用的模型`);
  if (usage?.enforce) await assertInteractiveUsageAllowed(usage.userId);
  let lastErr: unknown;
  for (const entry of chain) {
    try {
      const client = createClientFor(entry);
      // 思考类模型需开启 enable_thinking，否则只输出 reasoning_content、content 为空
      const extraBody = entry.thinking ? { extra_body: { enable_thinking: true } } : {};
      const data = await fn(entry, client, extraBody);
      if (usage) {
        const u = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
        await recordUsage({
          userId: usage.userId,
          surface: usage.surface,
          tier,
          model: entry.modelName,
          inputTokens: u?.prompt_tokens ?? 0,
          outputTokens: u?.completion_tokens ?? 0,
          totalTokens: u?.total_tokens ?? 0,
        });
      }
      console.log(`[model-pool] completions 使用 model=${entry.modelName} tier=${tier}`);
      return { data, model: entry.modelName };
    } catch (err) {
      if (isQuotaError(err)) {
        if (isRateLimitError(err)) {
          markModelRateLimited(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 触发限流，冷却 60s 后重试`);
        } else {
          markModelExhausted(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 免费额度耗尽，降级`);
        }
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`[model-pool] ${tier} 档所有模型请求失败`);
}

export interface PooledStream {
  stream: ReadableStream<string>;
  model: string;
}

type StreamTextOptions = Parameters<typeof streamText>[0];

/** 流式（streamText）：剥取首个 chunk 以在返回给客户端前暴露 403，额度耗尽自动换下一个模型 */
export async function streamTextWithFallback(
  tier: ModelTier,
  build: (entry: ModelEntry, model: LanguageModel) => StreamTextOptions,
  usage?: UsageContext
): Promise<PooledStream> {
  const chain = getChain(tier);
  if (chain.length === 0) throw new Error(`[model-pool] ${tier} 档无可用的模型`);
  if (usage?.enforce) await assertInteractiveUsageAllowed(usage.userId);
  let lastErr: unknown;
  for (const entry of chain) {
    try {
      const model = createModelFor(entry);
      // maxRetries=0：429/403 直接抛给模型池切下一个模型，SDK 不重试已耗尽/限流的模型
      const options = { ...build(entry, model), maxRetries: 0 };
      // 思考类模型注入 enable_thinking（extra_body），否则只出 reasoning 不出内容
      if (entry.thinking) {
        options.providerOptions = {
          ...(options.providerOptions ?? {}),
          openai: {
            ...((options.providerOptions?.openai ?? {}) as Record<string, unknown>),
            extraBody: { enable_thinking: true },
          },
        } as StreamTextOptions["providerOptions"];
      }
      // 记账：包一层 onEnd（先跑调用方原 onEnd，再记录本次用量）。只在成功的模型上包。
      if (usage) {
        const originalOnEnd = options.onEnd;
        const rec = {
          userId: usage.userId,
          surface: usage.surface,
          tier,
          model: entry.modelName,
        };
        options.onEnd = async (event) => {
          await originalOnEnd?.(event);
          await recordUsage({
            ...rec,
            inputTokens: event.usage?.inputTokens ?? 0,
            outputTokens: event.usage?.outputTokens ?? 0,
            totalTokens: event.usage?.totalTokens ?? 0,
          });
        };
      }
      const result = streamText(options);
      const textStream = toTextStream({ stream: result.stream });
      const { stream } = await peelFirstChunk(textStream);
      console.log(`[model-pool] stream 使用 model=${entry.modelName} tier=${tier}`);
      return { stream, model: entry.modelName };
    } catch (err) {
      if (isQuotaError(err)) {
        if (isRateLimitError(err)) {
          markModelRateLimited(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 触发限流，冷却 60s 后重试`);
        } else {
          markModelExhausted(entry.modelName);
          console.warn(`[model-pool] ${entry.modelName} 免费额度耗尽，降级`);
        }
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`[model-pool] ${tier} 档所有模型请求失败`);
}

/** 读取流的第一个 chunk（模型 403 会在此时抛出，从而触发降级）；成功则返回「首块 + 剩余」的合成流 */
async function peelFirstChunk(
  stream: ReadableStream<string>
): Promise<{ stream: ReadableStream<string> }> {
  const reader = stream.getReader();
  const first = await reader.read();
  if (first.done) {
    reader.releaseLock();
    return { stream: new ReadableStream<string>({ start(c) { c.close(); } }) };
  }
  const out = new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(first.value);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
  return { stream: out };
}
