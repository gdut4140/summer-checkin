import { format, isSameDay, isSameYear } from "date-fns";

// ============================================================
// 消息气泡上的时间戳
//
// 规则：**当天只给时间，跨天必须给日期。**
//
// 界面上原先只显示 HH:mm，这在只有当天消息时没问题。但聊天室和 AI 对话都会加载
// 历史——一条三天前的消息显示「14:32」不只是信息缺失，是彻头彻尾的误导：用户会
// 以为那是今天下午发的。
//
// 年份只在跨年时出现，同一个道理：同年之内补年份是噪音，跨年不给就是歧义。
//
// now 可注入是为了测试——用真实当前时间写断言会在跨天那一刻随机变红。
// ============================================================

/**
 * @param value ISO 字符串或 Date
 * @param now   参照时刻，默认当前时间（仅测试需要传）
 */
export function formatMessageTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  // 脏数据不要渲染成 "Invalid Date"
  if (Number.isNaN(date.getTime())) return "";

  const time = format(date, "HH:mm");
  if (isSameDay(date, now)) return time;
  if (isSameYear(date, now)) return `${format(date, "M月d日")} ${time}`;
  return `${format(date, "yyyy年M月d日")} ${time}`;
}
