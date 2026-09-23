import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";

// ============================================================
// 用户每日 AI token 用量与限额
// 模型池（completionsWithFallback / streamTextWithFallback）统一记账；
// 交互式面（agent / studio / 聊天室）超限抛 UsageLimitError，后端返回友好提示。
// ============================================================

/** 余额不足或每日精力用完时的统一回复文案 */
export const ENERGY_DOWN_MESSAGE = "没精力了，宕机了";

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
  /** 是否不限量（AI_TOKEN_LIMIT=0 或未配置时，或该用户是 VIP） */
  unlimited: boolean;
}

/** 每日限额（env AI_TOKEN_LIMIT，0 = 不限），默认 20 万 token */
export function usageLimit(): number {
  const raw = Number(process.env.AI_TOKEN_LIMIT ?? 200000);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * 由「每日限额 / 是否 VIP / 已用量」算出今天的状态（纯函数）
 *
 * VIP 与全局不限量（limit<=0）走同一条分支：limit 归 0、remaining 给
 * MAX_SAFE_INTEGER，于是 assertInteractiveUsageAllowed 的 `remaining <= 0`
 * 恒不成立。`used` 照样回传——不限额不等于不观测。
 */
export function buildTodayUsage(limit: number, isVip: boolean, used: number): TodayUsage {
  if (isVip || limit <= 0) {
    return { used, limit: 0, remaining: Number.MAX_SAFE_INTEGER, unlimited: true };
  }
  return { used, limit, remaining: Math.max(limit - used, 0), unlimited: false };
}

export async function getTodayUsage(userId: string): Promise<TodayUsage> {
  const limit = usageLimit();
  const [user, agg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { vip: true } }),
    prisma.tokenUsage.aggregate({
      where: { userId, createdAt: { gte: startOfDay(new Date()) } },
      _sum: { totalTokens: true },
    }),
  ]);
  // 用量始终记账（recordUsage 不动）：保留统计，也让精力条能显示真实消耗，
  // 而不是因为它不限额就失去观测。这里只改「限额判断」这一件事。
  return buildTodayUsage(limit, user?.vip ?? false, agg._sum.totalTokens ?? 0);
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
