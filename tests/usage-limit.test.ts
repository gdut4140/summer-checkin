import { describe, expect, it } from "vitest";
import { buildTodayUsage } from "@/lib/usage";

// 这段逻辑决定「用户还能不能继续用 AI」。它只有两个分支，但两个分支的后果
// 都不小：判错一边是 VIP 照样被拦（白设），另一边是普通人超额仍放行（额度失控）。
// 所以四个象限都要钉住，而不是只测 VIP 那一侧。

describe("buildTodayUsage", () => {
  it("普通人未超额 → 正常计数", () => {
    const u = buildTodayUsage(100_000, false, 30_000);
    expect(u).toEqual({ used: 30_000, limit: 100_000, remaining: 70_000, unlimited: false });
  });

  it("普通人刚好用完 → remaining 归 0（触发拦截）", () => {
    const u = buildTodayUsage(100_000, false, 100_000);
    expect(u.remaining).toBe(0);
    expect(u.unlimited).toBe(false);
  });

  it("普通人超额 → remaining 不会变负数", () => {
    const u = buildTodayUsage(100_000, false, 250_000);
    expect(u.remaining).toBe(0);
    expect(u.limit).toBe(100_000);
  });

  it("VIP 无视限额 → unlimited，超额也放行", () => {
    const u = buildTodayUsage(100_000, true, 250_000);
    expect(u.unlimited).toBe(true);
    expect(u.remaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(u.limit).toBe(0);
    // 关键：用量仍然回传，不限额 ≠ 不观测
    expect(u.used).toBe(250_000);
  });

  it("VIP 且当日零用量 → 仍是 unlimited", () => {
    expect(buildTodayUsage(100_000, true, 0).unlimited).toBe(true);
  });

  // AI_TOKEN_LIMIT=0 表示全局不限量，与 VIP 同路
  it("全局不限量（limit=0）→ unlimited，即使不是 VIP", () => {
    const u = buildTodayUsage(0, false, 999_999);
    expect(u.unlimited).toBe(true);
    expect(u.remaining).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("VIP + 全局不限量 → 仍是一致的 unlimited", () => {
    expect(buildTodayUsage(0, true, 12_345)).toEqual(buildTodayUsage(0, false, 12_345));
  });
});
