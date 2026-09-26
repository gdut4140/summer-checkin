"use client";

import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { DialogContent } from "@/components/ui/dialog";

/**
 * 详情弹层的通用外壳 —— 公告弹窗、铃铛里点开的公告 / 通知，三处共用同一套视觉。
 *
 * 走产品自己的令牌，所以 rain / snow / cloud 三种场景自动跟随：
 * - `--surface-glass-strong-*`：按场景覆盖的毛玻璃底 + 发丝描边 + 内高光
 * - `--primary`：唯一强调色。集中用在三处 —— 顶部环境光、实心图标胶囊、底部实心按钮
 *
 * 尺寸刻意做成大方形：宽 620 封顶，高按视口取 80% 同样封顶 620，
 * 桌面端接近正方；正文用 flex-1 吃掉多余空间，操作区钉在底部。
 */

const MARKDOWN_CLASS = [
  "prose prose-sm prose-invert max-w-none text-foreground/85",
  "[&_h1]:text-[17px] [&_h1]:font-semibold",
  "[&_h2]:text-[15px] [&_h2]:font-semibold",
  "[&_h3]:text-[14px] [&_h3]:font-semibold",
  "[&_p]:text-[14px] [&_p]:leading-[1.85]",
  "[&_li]:text-[14px] [&_li]:leading-[1.8]",
  "[&_a]:text-primary [&_a]:no-underline [&_a]:underline-offset-2 hover:[&_a]:underline",
  "[&_strong]:text-foreground [&_strong]:font-semibold",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-foreground/65",
  "[&_code]:text-primary",
].join(" ");

const PLAIN_CLASS = "whitespace-pre-wrap text-[14px] leading-[1.85] text-foreground/85";

export function DetailCard({
  icon: Icon,
  eyebrow,
  title,
  meta,
  content,
  /** 内容是否按 Markdown 渲染（通知里的纯文本要关掉，否则 * # 之类会被吃掉） */
  markdown = true,
  action,
}: {
  icon?: PhosphorIcon;
  eyebrow: string;
  title: string;
  meta: string;
  content: string;
  markdown?: boolean;
  /** 底部操作区 */
  action: ReactNode;
}) {
  return (
    <DialogContent
      showCloseButton
      className={[
        "flex w-full flex-col gap-0 overflow-hidden p-0",
        "sm:max-w-[620px]",
        "min-h-[min(80vh,620px)]",
        "border border-[var(--surface-glass-strong-border)]",
        "bg-[var(--surface-glass-strong-bg)] backdrop-blur-2xl",
        "text-foreground",
        "shadow-[var(--surface-glass-strong-shadow)]",
      ].join(" ")}
    >
      {/* 顶部环境光 —— 大面积的强调色只此一处，透明度压得很低 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 72%)",
        }}
      />

      <header className="relative px-8 pb-6 pt-9">
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              style={{
                boxShadow:
                  "0 6px 20px -8px color-mix(in srgb, var(--primary) 60%, transparent), inset 0 1px 0 rgba(255,255,255,.28)",
              }}
            >
              <Icon className="size-4" weight="fill" />
            </span>
          )}
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        </div>

        <h2 className="mt-5 text-[26px] font-semibold leading-[1.3] text-balance text-foreground">
          {title}
        </h2>
        <p className="mt-2.5 text-[11px] tabular-nums text-muted-foreground/70">
          {meta}
        </p>
      </header>

      <div className="relative flex-1 overflow-y-auto px-8">
        <div className="mb-6 h-px w-full bg-foreground/10" />
        <div className={markdown ? MARKDOWN_CLASS : PLAIN_CLASS}>
          {markdown ? <ReactMarkdown>{content}</ReactMarkdown> : content}
        </div>
      </div>

      <footer className="relative mt-7 px-8 pb-8">
        <div className="mb-6 h-px w-full bg-foreground/10" />
        {action}
      </footer>
    </DialogContent>
  );
}
