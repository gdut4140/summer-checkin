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

export type ModelProvider = "agnes" | "aliyun" | "opencode";
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
  | "embedding";

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
}

const PROVIDER_CONFIG: Record<ModelProvider, { baseURL: string; apiKey: string }> = {
  agnes: {
    baseURL:
      process.env.AGNES_BASE_URL ??
      process.env.DASHSCOPE_BASE_URL ??
      "https://apihub.agnes-ai.com/v1",
    apiKey: process.env.AGNES_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "",
  },
  aliyun: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 现有项目里 EMBEDDING_API_KEY 就是阿里百炼 key（知识库 embedding 一直在用），可复用
    apiKey: process.env.ALIYUN_API_KEY ?? process.env.EMBEDDING_API_KEY ?? "",
  },
};

// ── HIGH 档（agent / 文档 studio / 后台规划）：agnes 免费优先，不可用/额度耗尽降级阿里云 ──
const HIGH_CHAIN: ModelEntry[] = [
  { modelName: "agnes-2.5-flash", displayName: "Agnes 2.5 Flash", provider: "agnes", modelType: "general", tier: "high" },
  { modelName: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", provider: "opencode", modelType: "general", tier: "high" },
  { modelName: "muse-spark-1.2", displayName: "Muse Spark 1.2", provider: "opencode", modelType: "general", tier: "high" },
  { modelName: "qwen3.7-max-2026-06-08", displayName: "通义千问 3.7 Max", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "deepseek-v4-pro-0813", displayName: "DeepSeek V4 Pro", provider: "aliyun", modelType: "general", thinking: true, tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3-max-2026-01-23", displayName: "通义千问 3 Max", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-plus-2026-05-26", displayName: "通义千问 3.7 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "deepseek-v3.2", displayName: "DeepSeek V3.2", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.5-plus-2026-04-20", displayName: "通义千问 3.5 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen-plus-2025-12-01", displayName: "通义千问 Plus", provider: "aliyun", modelType: "general", tier: "high", freeQuotaEnd: "2026-11-07" },
];

// ── LOW 档（聊天室/标题/记忆/拆任务）：agnes 免费优先，额度用完降级阿里云 flash ──
const LOW_CHAIN: ModelEntry[] = [
  { modelName: "agnes-2.5-flash", displayName: "Agnes 2.5 Flash", provider: "agnes", modelType: "general", tier: "low" },
  { modelName: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", provider: "opencode", modelType: "general", tier: "low" },
  { modelName: "muse-spark-1.2", displayName: "Muse Spark 1.2", provider: "opencode", modelType: "general", tier: "low" },
  { modelName: "qwen-flash-2025-07-28", displayName: "通义千问 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.7-flash-2026-07-15", displayName: "通义千问 3.7 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen3.6-flash", displayName: "通义千问 3.6 Flash", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "qwen-turbo", displayName: "通义千问 Turbo", provider: "aliyun", modelType: "general", tier: "low", freeQuotaEnd: "2026-11-07" },
];

// ── Embedding 档（知识库 / memory 向量化）：不计入用户 token 精力条 ──
// 阿里云百炼文本向量：v4 最新优先，v2 老版本兜底（额度参考「阿里云向量模型.txt」）
const EMBEDDING_CHAIN: ModelEntry[] = [
  { modelName: "text-embedding-v4", displayName: "通义向量 v4", provider: "aliyun", modelType: "embedding", tier: "low", freeQuotaEnd: "2026-11-07" },
  { modelName: "text-embedding-v2", displayName: "通义向量 v2", provider: "aliyun", modelType: "embedding", tier: "low", freeQuotaEnd: "2026-11-07" },
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
    if (!isModelAvailable(e.modelName)) return false;
    if (!PROVIDER_CONFIG[e.provider].apiKey) return false;
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
      });
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      console.log(`[model-pool] embedding 使用 model=${entry.modelName} provider=${entry.provider}`);
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
