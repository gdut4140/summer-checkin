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
        data-role={isUser ? "user" : "ai"}
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-primary text-primary-foreground",
          isUser ? "rounded-br-md" : "rounded-bl-md"
        )}
      >
        {/* Day 4: 使用 Markdown 渲染器替代纯文本 */}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <span className="flex items-center gap-1.5 text-primary-foreground/70">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary-foreground/70" />
            思考中…
          </span>
        )}
        <p className={cn("mt-1 text-[10px] text-primary-foreground/60")}>
          {format(message.createdAt, "HH:mm")}
        </p>
      </div>
    </div>
  );
}
