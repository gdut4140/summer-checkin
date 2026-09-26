"use client";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import type { ChatMessage } from "@/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

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
        {/* 使用 Markdown 渲染器替代纯文本 */}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <span className="flex items-center gap-1.5 opacity-70">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
            思考中…
          </span>
        )}
        <p className={cn("mt-1 text-[10px] opacity-55")}>
          {format(message.createdAt, "HH:mm")}
        </p>
      </div>
    </div>
  );
}
