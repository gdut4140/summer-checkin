import { format, subDays } from "date-fns";

// ============================================================
// 「哪一天」与「连续打卡」的唯一口径
//
// 抽出来是因为原先有四份实现、两种时区口径，而且它们给出的数字互不相同：
//
//   checkin/page.tsx        date-fns startOfDay/endOfDay   本地日（正确）
//   statistics/page.tsx     format(..., "yyyy-MM-dd")      本地日，但缺今天直接断
//   study-stats.ts          toISOString().slice(0,10)      UTC 日（错位）
//   agent/runtime.ts        同上（逐字复制的一份）
//
// 错在哪：本地零点过 toISOString() 会退回前一天。Asia/Shanghai 下
// `todayStart.toISOString().slice(0,10)` 拿到的是**昨天**，于是循环里的「今天」
// 其实是昨天 —— 今天打的卡落在扫描窗口之外，连打三天只报两天。
//
// 仓库自己早就写过这条规矩（lib/announcement-popup.ts 顶部）：
// 「日期必须按本地时区算。用 toISOString().slice(0, 10) 拿到的是 UTC 日期」。
// 打卡这边一直没遵守。
// ============================================================

/** 某一天在**本地时区**下的 YYYY-MM-DD。全站判断「哪一天」只用它。 */
export function localDayKey(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

/** 从打卡记录里取出「有打卡的那些天」 */
export function checkinDayKeys(
  checkins: readonly { checkinDate: Date }[]
): Set<string> {
  return new Set(checkins.map((c) => localDayKey(c.checkinDate)));
}

/**
 * 连续打卡天数。
 *
 * 语义（沿用打卡页最早就写对的那条）：从今天往回数，**今天还没打卡不算断**——
 * 否则用户每天早上一睁眼就会看到自己的连续天数归零。
 *
 * 上限 365 天，与原先几处实现一致，防止脏数据造出无限循环。
 */
export function computeStreak(
  dayKeys: ReadonlySet<string>,
  now: Date = new Date()
): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    // subDays 而不是 now - i*86400000：后者在夏令时切换日会算错一天
    if (dayKeys.has(localDayKey(subDays(now, i)))) streak++;
    else if (i > 0) break;
  }
  return streak;
}
