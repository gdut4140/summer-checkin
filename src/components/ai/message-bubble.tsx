"use client";

import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/datetime";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { ToolCallBox, type ToolViewPart } from "@/components/ai/tool-call-box";
import type { ViewPart } from "@/lib/ai/parts";
import type { ChatMessage } from "@/types";

/**
 * 助手回复的正文。
 *
 * parts 与 content 是**并存**的两种表示，不是新旧替代：
 * - parts   结构化（text / tool），能渲染工具调用。智能体页走这条。
 * - content 纯文本。studio 面板仍走纯文本协议；2026-10 之前的存量对话也只有它。
 *
 * 有 parts 就按 parts 渲染，否则回落到把 content 当一段 Markdown——存量对话与
 * 未迁移的面板因此零改动继续可用。
 *
 * ⚠️ 工具框固定放在**最前面**，不按第一个工具调用出现的位置插。
 * 曾经试过「插在第一个 tool part 的位置」，结果是位置不稳定：空 text part 会被
 * 过滤掉，于是流式早期列表里只有 tool、框排第一；等文字内容到了，列表变成
 * [text, tool]，框就被挤到文字下面——生成过程中来回跳，看起来就是窗口抽搐。
 * 位置固定后，框只会在「第一次出现」时把正文下推一次。
 */
function MessageParts({ parts }: { parts: readonly ViewPart[] }) {
  const toolParts = parts.filter((part): part is ToolViewPart => part.type === "tool");

  return (
    <div className="space-y-2">
      {toolParts.length > 0 ? <ToolCallBox parts={toolParts} /> : null}
      {parts.map((part, index) =>
        part.type === "text" ? (
          <MarkdownRenderer key={`t${index}`} content={part.text} />
        ) : null
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage;
  /** 这条消息正在流式生成中（由 useChat 的 status 推出） */
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const hasParts = !isUser && (message.parts?.length ?? 0) > 0;
  // 有 parts 时以「有没有文本」判断是否空转；没有 parts 时沿用原来的 content 判断
  const hasText = hasParts
    ? message.parts!.some((part) => part.type === "text" && part.text)
    : !!message.content;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        data-bubble={isUser ? "user" : "ai"}
        className={cn(
          "max-w-[80%] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed",
          // break-words 是必须的：用户可能发来一长串不可断的内容（数字 / 英文 / URL），
          // 没有它就会按 min-content 撑开并溢出气泡（实测 200 个字符能让内容宽到 1658px）。
          // 气泡本身被 max-w-[80%] 约束住，所以断词规则一加上就能正常折行。
          "break-words",
          "backdrop-blur-xl",
          isUser
            ? "rounded-br-md border-primary/40 bg-primary text-primary-foreground shadow-[0_2px_12px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]"
            : "rounded-bl-md border-white/10 bg-foreground/[0.06] text-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : hasParts ? (
          <MessageParts parts={message.parts!} />
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : null}

        {/* 空转提示。有 parts 时只在「正在生成且还没有任何文字」时出现——
            工具卡片自己带转圈，再叠一个「思考中」就重复了；而全部工具跑完之后
            模型组织最终回答的那段时间，只剩一排打勾的卡片，没有它就看着像卡死。 */}
        {!hasText && (!hasParts || streaming) ? (
          <span
            className={cn(
              "flex items-center gap-1.5 opacity-70",
              hasParts && "mt-2 text-[12px]"
            )}
          >
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
            思考中…
          </span>
        ) : null}

        <p className={cn("mt-1 text-[10px] opacity-55")}>
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
