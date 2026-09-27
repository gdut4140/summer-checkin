import { describe, expect, it } from "vitest";
import { decideAnnouncementPopup, localDayString } from "@/lib/announcement-popup";

// 「今天弹过没有」现在完全由服务端说了算（seenOn === localDayString()），
// 客户端只剩两件事要判对：哪一天算「今天」，以及要不要先等新手引导。

describe("localDayString", () => {
  it("产出 YYYY-MM-DD（个位数月/日补零）", () => {
    expect(localDayString(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });

  it("按本地时区算 —— 这就是发给服务端做相等比较的那个值", () => {
    // 本地清晨（UTC+8 下对应前一天 UTC）。若改用 toISOString().slice(0,10)
    // 这里会得到 2026-01-04，于是「今天」从早上 8 点才翻转。
    expect(localDayString(new Date(2026, 0, 5, 7, 30))).toBe("2026-01-05");
    // 同一天深夜仍是同一天
    expect(localDayString(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("跨天换值 —— 这是每天能再弹一次的依据", () => {
    expect(localDayString(new Date(2026, 8, 27, 23, 59))).not.toBe(
      localDayString(new Date(2026, 8, 28, 0, 1))
    );
  });
});

describe("decideAnnouncementPopup", () => {
  it("引导已看过（含直接叉掉）→ 直接去问服务端", () => {
    expect(decideAnnouncementPopup({ tourSeen: true })).toBe("now");
  });

  it("引导还没看过 → 挂起，等 tour:finished 再弹", () => {
    expect(decideAnnouncementPopup({ tourSeen: false })).toBe("after-tour");
  });
});
