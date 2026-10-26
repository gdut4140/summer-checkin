// ============================================================
// 聊天室 AI 上下文：把群聊历史转成模型消息
//
// 关键规则：同一段历史，对不同 AI 来说「自己」是不同的。
//   · 当前 AI 自己发的消息 → assistant 角色（模型天然知道这是自己的历史回复）
//   · 另一个 AI 发的消息   → user 角色 + 【名字】前缀（对当前 AI 来说就是个群友）
//   · 人类消息             → user 角色 + 【名字】前缀
//
// 之前两个 AI 的消息都标成 assistant，只靠 name 字段区分。但 assistant
// 的角色语义就是「模型自己的输出」，而 name 又常被兼容层忽略——于是温柔宝
// 会把嘴欠宝的话当成自己说的（真实故障）。上下文里必须只有「自己」是
// assistant，否则模型无法分辨哪些话是自己说的。
// ============================================================

import type { AiRole } from "./protocol";

/** 数据库里一条 chatmessage 的必要字段（保持纯函数，方便测试） */
export interface ChatHistoryRow {
  id: string;
  role: string;
  content: string;
  aiRole: string | null;
  user?: { name: string | null } | null;
}

export type ChatContextMessage =
  | { role: "assistant"; content: string }
  | { role: "user"; content: string };

const AI_DISPLAY_NAME: Record<AiRole, string> = {
  gentle: "温柔宝",
  snarky: "嘴欠宝",
};

export interface ReplyContext {
  userName: string | null;
  content: string;
}

/**
 * 构造「有人 @ 了你」这条消息。
 *
 * 必须显式带上发送者：
 *   · 触发消息本身已经从历史里排除（避免同一句话出现两次）；
 *   · 如果这里只写「有人@了你」，模型就永远不知道是谁在叫它，
 *     群聊里尤其容易张冠李戴。
 */
export function buildTriggerPrompt(
  prompt: string,
  senderName?: string,
  replyTo?: ReplyContext | null
): string {
  const sender = senderName?.trim() || "有人";
  const rawQuote = replyTo?.content;
  const quote = rawQuote
    ? rawQuote.length > 400
      ? rawQuote.slice(0, 400) + "…"
      : rawQuote
    : undefined;

  if (!quote) {
    return `【${sender}】@了你：${prompt}`;
  }

  const author = replyTo?.userName?.trim() || "用户";
  return (
    `【${sender}】@了你，转给你一条【${author}】发的消息：\n` +
    `> ${quote}\n\n` +
    `这条消息是【${author}】发的。请回应：${prompt}`
  );
}

/**
 * 构造模型上下文。
 *
 * @param messages         历史消息，**按时间正序**
 * @param selfRole         当前被 @ 的 AI
 * @param triggerMessageId 本次触发消息的 id：它已经以「有人@了你」的形式单独追加，
 *                         不能在同一条历史里再出现一次
 */
export function buildChatContext(
  messages: ChatHistoryRow[],
  selfRole: AiRole,
  triggerMessageId?: string
): ChatContextMessage[] {
  return messages
    .filter((m) => m.id !== triggerMessageId)
    .map((m) => {
      if (m.role === "assistant") {
        // 只有自己的历史回复才是 assistant
        if (m.aiRole === selfRole) {
          return { role: "assistant" as const, content: m.content };
        }
        // 另一个 AI（或无法识别角色的旧数据）当作群友，显式标名字
        const speaker =
          m.aiRole === "gentle" || m.aiRole === "snarky"
            ? AI_DISPLAY_NAME[m.aiRole]
            : AI_DISPLAY_NAME.snarky;
        return { role: "user" as const, content: `【${speaker}】${m.content}` };
      }

      const name = m.user?.name ?? "匿名用户";
      return { role: "user" as const, content: `【${name}】${m.content}` };
    });
}
