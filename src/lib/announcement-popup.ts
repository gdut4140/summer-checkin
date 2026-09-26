// ============================================================
// 「每天弹一次公告」的纯逻辑
//
// 拆出来是因为这里有两条容易写错、且错了不容易发现的规则：
//   1. 日期必须按**本地时区**算。用 `toISOString().slice(0, 10)` 拿到的是
//      UTC 日期 —— 对 UTC+8 的用户来说，「今天」会在早上 8 点翻转，
//      于是弹窗要么漏一天、要么一天弹两次。
//   2. 新手引导没看过时不能弹公告，得等引导结束再弹。
// ============================================================

/** 本地日期字符串 YYYY-MM-DD —— 服务端只存这个值做相等比较，不解释它 */
export function localDayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 本机快路径用的 key（用户 + 本地日期，一天一个）。
 *
 * 必须带 userId —— 同一台浏览器换账号时，A 弹过的记录不能把 B 的弹窗压掉。
 * 服务端那份（user.announcementSeenOn）本来就是按用户存的，两边口径要一致。
 */
export function announcementPopupKey(userId: string, now: Date = new Date()): string {
  return `summer-checkin.announcement.${userId}.${localDayString(now)}`;
}

export type PopupDecision =
  /** 今天已经弹过了 */
  | "skip"
  /** 直接弹 */
  | "now"
  /** 新手引导还在等着播，先挂起，等引导结束再弹 */
  | "after-tour";

export function decideAnnouncementPopup(opts: {
  /** 今天的 key 是否已命中（已经弹过） */
  poppedToday: boolean;
  /** 新手引导是否已经看过 */
  tourSeen: boolean;
}): PopupDecision {
  if (opts.poppedToday) return "skip";
  return opts.tourSeen ? "now" : "after-tour";
}
