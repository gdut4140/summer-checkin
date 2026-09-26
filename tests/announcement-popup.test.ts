import { describe, expect, it } from "vitest";
import {
  announcementPopupKey,
  decideAnnouncementPopup,
  localDayString,
} from "@/lib/announcement-popup";

// 这两条规则错了都不会报错、只会静默表现成"弹窗时机不对"：
// 日期用了 UTC 就每天错开 8 小时；忘了等引导就会在引导还没播完时弹公告叠上去。

describe("announcementPopupKey", () => {
  it("按 用户 + 本地日期 生成，一天一个 key", () => {
    const d = new Date(2026, 8, 27, 0, 30); // 2026-09-27 00:30（本地）
    expect(announcementPopupKey("u1", d)).toBe(
      "summer-checkin.announcement.u1.2026-09-27"
    );
  });

  it("带 userId —— 同一浏览器换账号时不会互相压掉弹窗", () => {
    const d = new Date(2026, 8, 27, 10, 0);
    expect(announcementPopupKey("u1", d)).not.toBe(announcementPopupKey("u2", d));
  });

  it("用的是本地时区，不是 UTC", () => {
    // 本地 07:30 在 UTC+8 下是前一天的 UTC 23:30 —— 若改用
    // toISOString().slice(0,10)，这里会得到 09-26，于是"今天"从早上 8 点才翻转
    const earlyMorning = new Date(2026, 8, 27, 7, 30);
    expect(announcementPopupKey("u1", earlyMorning)).toContain("2026-09-27");
    // 同一天的深夜仍是同一个 key
    const lateNight = new Date(2026, 8, 27, 23, 30);
    expect(announcementPopupKey("u1", lateNight)).toBe(
      announcementPopupKey("u1", earlyMorning)
    );
  });

  it("跨天换 key", () => {
    expect(announcementPopupKey("u1", new Date(2026, 8, 27, 23, 59))).not.toBe(
      announcementPopupKey("u1", new Date(2026, 8, 28, 0, 1))
    );
  });
});

describe("localDayString", () => {
  it("产出 YYYY-MM-DD（个位数月/日补零）", () => {
    expect(localDayString(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });

  it("按本地时区算 —— 这就是发给服务端做相等比较的那个值", () => {
    // 本地清晨（UTC+8 下对应前一天 UTC）
    expect(localDayString(new Date(2026, 0, 5, 7, 30))).toBe("2026-01-05");
    // 同一天深夜仍是同一天
    expect(localDayString(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("是弹窗 key 的后缀", () => {
    const d = new Date(2026, 8, 27, 10, 0);
    expect(announcementPopupKey("u1", d)).toBe(
      `summer-checkin.announcement.u1.${localDayString(d)}`
    );
  });
});

describe("decideAnnouncementPopup", () => {
  it("今天已经弹过 → 跳过（无论引导看没看过）", () => {
    expect(decideAnnouncementPopup({ poppedToday: true, tourSeen: true })).toBe("skip");
    expect(decideAnnouncementPopup({ poppedToday: true, tourSeen: false })).toBe("skip");
  });

  it("没弹过、引导看过了 → 直接弹", () => {
    expect(decideAnnouncementPopup({ poppedToday: false, tourSeen: true })).toBe("now");
  });

  it("没弹过、引导还没看过 → 挂起等引导结束", () => {
    expect(decideAnnouncementPopup({ poppedToday: false, tourSeen: false })).toBe(
      "after-tour"
    );
  });
});
