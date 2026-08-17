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
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {/* Day 4: 使用 Markdown 渲染器替代纯文本 */}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            思考中…
          </span>
        )}
        <p
          className={cn(
            "text-[10px] mt-1",
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          )}
        >
          {format(message.createdAt, "HH:mm")}
        </p>
      </div>
    </div>
  );
}
