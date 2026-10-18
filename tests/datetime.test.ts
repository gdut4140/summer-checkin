import { describe, expect, it } from "vitest";

// 气泡时间戳的规则：当天只给时间，跨天必须给日期。
//
// 这条不是排版偏好——聊天室和 AI 对话都会加载历史，一条三天前的消息显示「14:32」
// 会让用户以为它是今天下午发的。年份同理：同年补年份是噪音，跨年不给是歧义。
//
// 时间一律用不带 Z 的字面量构造（按本地时区解析），断言才不会随 CI 时区漂。

import { formatMessageTime } from "@/lib/datetime";

const NOW = new Date("2026-10-16T20:00:00");

describe("formatMessageTime", () => {
  it("当天只给时间", () => {
    expect(formatMessageTime("2026-10-16T14:32:00", NOW)).toBe("14:32");
  });

  it("当天的首尾时刻仍算当天", () => {
    expect(formatMessageTime("2026-10-16T00:00:00", NOW)).toBe("00:00");
    expect(formatMessageTime("2026-10-16T23:59:00", NOW)).toBe("23:59");
  });

  it("昨天带上月日", () => {
    expect(formatMessageTime("2026-10-15T23:59:00", NOW)).toBe("10月15日 23:59");
  });

  it("同年不同日：月日 + 时间，不带年份", () => {
    expect(formatMessageTime("2026-01-02T09:05:00", NOW)).toBe("1月2日 09:05");
  });

  it("跨年才带年份", () => {
    expect(formatMessageTime("2025-12-31T23:10:00", NOW)).toBe("2025年12月31日 23:10");
  });

  it("接受 Date 对象", () => {
    expect(formatMessageTime(new Date("2026-10-16T08:00:00"), NOW)).toBe("08:00");
  });

  it("脏数据不渲染成 Invalid Date", () => {
    expect(formatMessageTime("not a date", NOW)).toBe("");
    expect(formatMessageTime("", NOW)).toBe("");
  });

  it("默认用当前时间做参照", () => {
    // 刚刚发生的一定是「当天」，只给时间
    const now = new Date();
    expect(formatMessageTime(new Date(now.getTime() - 60_000))).toMatch(/^\d{2}:\d{2}$/);
  });
});
