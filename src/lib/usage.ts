import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";

// ============================================================
// 用户每日 AI token 用量与限额
// 模型池（completionsWithFallback / streamTextWithFallback）统一记账；
// 交互式面（agent / studio / 聊天室）超限抛 UsageLimitError，后端返回友好提示。
// ============================================================

/** 余额不足或每日精力用完时的统一回复文案 */
export const ENERGY_DOWN_MESSAGE = "没精力了，宕机了，呃啊";

/** 交互式面超限（每日精力用完）时抛出的错误，路由据此流式返回友好文本 */
export class UsageLimitError extends Error {
  constructor(message = ENERGY_DOWN_MESSAGE) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export interface TodayUsage {
  used: number;
  limit: number;
  remaining: number;
  /** 是否不限量（AI_TOKEN_LIMIT=0 或未配置时） */
  unlimited: boolean;
}

/** 每日限额（env AI_TOKEN_LIMIT，0 = 不限） */
export function usageLimit(): number {
  const raw = Number(process.env.AI_TOKEN_LIMIT ?? 100000);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export async function getTodayUsage(userId: string): Promise<TodayUsage> {
  const limit = usageLimit();
  const agg = await prisma.tokenUsage.aggregate({
    where: { userId, createdAt: { gte: startOfDay(new Date()) } },
    _sum: { totalTokens: true },
  });
  const used = agg._sum.totalTokens ?? 0;
  return {
    used,
    limit,
    remaining: limit > 0 ? Math.max(limit - used, 0) : Number.MAX_SAFE_INTEGER,
    unlimited: limit <= 0,
  };
}

/** 交互式面超限检查；只剩 0 时抛 UsageLimitError */
export async function assertInteractiveUsageAllowed(userId: string): Promise<void> {
  const { remaining } = await getTodayUsage(userId);
  if (remaining <= 0) throw new UsageLimitError();
}

export interface UsageRecord {
  userId: string;
  surface: string;
  tier: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** 记录一次 AI 调用用量；拿不到用量（totalTokens<=0）或写入失败都不阻断主流程 */
export async function recordUsage(rec: UsageRecord): Promise<void> {
  if (!rec.totalTokens || rec.totalTokens <= 0) return;
  try {
    await prisma.tokenUsage.create({ data: rec });
  } catch (err) {
    console.error("[usage] 记录用量失败:", err);
  }
}
