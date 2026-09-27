// ============================================================
// 「每天弹一次公告」的纯逻辑
//
// 拆出来是因为这里有一条容易写错、且错了不容易发现的规则：
// 日期必须按**本地时区**算。用 `toISOString().slice(0, 10)` 拿到的是
// UTC 日期 —— 对 UTC+8 的用户来说，「今天」会在早上 8 点翻转，
// 于是弹窗要么漏一天、要么一天弹两次。
//
// 去重的唯一真相源是服务端的 `user.announcementSeenOn`（见 announcement-popup.tsx）。
// 这里不再有本机缓存 —— 两个真相源会让「重置已读」这类操作只生效一半。
// ============================================================

/** 本地日期字符串 YYYY-MM-DD —— 服务端只存这个值做相等比较，不解释它 */
export function localDayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type PopupDecision =
  /** 直接弹 */
  | "now"
  /** 新手引导还在等着播，先挂起，等引导结束再弹 */
  | "after-tour";

/**
 * 什么时候可以去问服务端要公告。
 *
 * 今天有没有弹过由服务端判断（`seenOn === 今天`），不在这里决定 ——
 * 所以本函数只剩「要不要先等引导」这一件事。
 */
export function decideAnnouncementPopup(opts: {
  /** 新手引导是否已经看过（看过或已叉掉都算） */
  tourSeen: boolean;
}): PopupDecision {
  return opts.tourSeen ? "now" : "after-tour";
}
