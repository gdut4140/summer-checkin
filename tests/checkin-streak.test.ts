import { describe, expect, it } from "vitest";

// 连续打卡原先有四份实现、两种时区口径，给出的数字互不相同。这组测试钉住统一后的
// 口径，其中第一条是**回归测试**：原实现用 toISOString().slice(0,10) 造日期键，
// 在 UTC+8 下会把本地零点算成前一天，于是「今天」整体后退一天——今天打的卡落在
// 扫描窗口之外，连打三天只报两天。
//
// 时间一律用不带 Z 的字面量（按本地时区解析），断言才不会随 CI 时区漂。

import { checkinDayKeys, computeStreak, localDayKey } from "@/lib/checkin-streak";

const at = (s: string) => new Date(s);

describe("localDayKey", () => {
  it("本地零点算作当天——原实现在这里退了一天", () => {
    expect(localDayKey(at("2026-10-16T00:00:00"))).toBe("2026-10-16");
  });

  it("当天最后一分钟仍算当天", () => {
    expect(localDayKey(at("2026-10-16T23:59:59"))).toBe("2026-10-16");
  });
});

describe("computeStreak", () => {
  const now = at("2026-10-16T20:00:00");
  const keys = (...days: string[]) => new Set(days);

  it("没有任何打卡 → 0", () => {
    expect(computeStreak(new Set(), now)).toBe(0);
  });

  it("今天打了 → 1", () => {
    expect(computeStreak(keys("2026-10-16"), now)).toBe(1);
  });

  it("连打三天 → 3", () => {
    expect(computeStreak(keys("2026-10-16", "2026-10-15", "2026-10-14"), now)).toBe(3);
  });

  it("今天还没打卡不算断（否则每天早上一睁眼就归零）", () => {
    expect(computeStreak(keys("2026-10-15", "2026-10-14"), now)).toBe(2);
  });

  it("今天和昨天都没打 → 0", () => {
    expect(computeStreak(keys("2026-10-14", "2026-10-13"), now)).toBe(0);
  });

  it("中间断了只数到断点", () => {
    expect(computeStreak(keys("2026-10-16", "2026-10-15", "2026-10-13"), now)).toBe(2);
  });

  it("只认紧挨着的那一段", () => {
    expect(computeStreak(keys("2026-10-16", "2026-06-01", "2026-06-02"), now)).toBe(1);
  });

  it("凌晨打卡（跨 UTC 日）也算今天", () => {
    // UTC+8 的 00:30 在 UTC 还是前一天——原实现在这里会算错
    expect(computeStreak(checkinDayKeys([{ checkinDate: at("2026-10-16T00:30:00") }]), now)).toBe(1);
  });
});

describe("checkinDayKeys", () => {
  it("同一天的多条记录只算一天", () => {
    // 这是常态：AI 代报「完成任务」时一个任务写一条，一天可以写好几条
    const keys = checkinDayKeys([
      { checkinDate: at("2026-10-16T09:00:00") },
      { checkinDate: at("2026-10-16T21:00:00") },
      { checkinDate: at("2026-10-15T10:00:00") },
    ]);
    expect(keys.size).toBe(2);
    expect(computeStreak(keys, at("2026-10-16T22:00:00"))).toBe(2);
  });
});
