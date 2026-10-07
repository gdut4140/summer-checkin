import { describe, expect, it } from "vitest";
import { UserRateLimiter } from "../server/rate-limit";

describe("UserRateLimiter", () => {
  it("在多个连接之间共享同一个用户的发送配额", () => {
    const limiter = new UserRateLimiter({ windowMs: 60_000, max: 2 });

    expect(limiter.allow("user-1", 1_000)).toBe(true);
    expect(limiter.allow("user-1", 1_001)).toBe(true);
    expect(limiter.allow("user-1", 1_002)).toBe(false);
  });

  it("不会把不同用户的消息混在同一个配额里", () => {
    const limiter = new UserRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.allow("user-1", 1_000)).toBe(true);
    expect(limiter.allow("user-2", 1_001)).toBe(true);
    expect(limiter.allow("user-1", 1_002)).toBe(false);
  });

  it("窗口结束后重新计数", () => {
    const limiter = new UserRateLimiter({ windowMs: 60_000, max: 1 });

    expect(limiter.allow("user-1", 1_000)).toBe(true);
    expect(limiter.allow("user-1", 60_999)).toBe(false);
    expect(limiter.allow("user-1", 61_000)).toBe(true);
  });

  it("可以清理过期用户的内存桶", () => {
    const limiter = new UserRateLimiter({ windowMs: 60_000, max: 1 });

    limiter.allow("user-1", 1_000);
    limiter.prune(61_000);
    expect(limiter.allow("user-1", 61_001)).toBe(true);
  });
});
