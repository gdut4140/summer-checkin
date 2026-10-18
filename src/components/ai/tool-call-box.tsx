"use client";

import { useState } from "react";
import { CaretDown, Check, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { toolUi } from "@/lib/tools/tool-ui";
import type { ViewPart } from "@/lib/ai/parts";

export type ToolViewPart = Extract<ViewPart, { type: "tool" }>;

/** 还在跑：模型正在吐参数，或参数齐了正在执行（含等审批） */
function isRunning(state: ToolViewPart["state"]): boolean {
  return (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested" ||
    state === "approval-responded"
  );
}

function isFailed(state: ToolViewPart["state"]): boolean {
  return state === "output-error" || state === "output-denied";
}

function stepText(part: ToolViewPart): string {
  const { label } = toolUi(part.toolName);
  return isRunning(part.state) ? `正在${label}…` : label;
}

function StepIcon({ state, className }: { state: ToolViewPart["state"]; className?: string }) {
  if (isRunning(state)) {
    return <CircleNotch className={cn("size-3.5 shrink-0 animate-spin", className)} />;
  }
  if (isFailed(state)) {
    return <WarningCircle className={cn("size-3.5 shrink-0", className)} weight="fill" />;
  }
  return <Check className={cn("size-3.5 shrink-0", className)} weight="bold" />;
}

/**
 * 一次回复里**所有**工具调用的总框。
 *
 * 为什么是一个框而不是每个调用一张卡片：一轮 agent 流程动辄五六次调用
 * （getStudyStats → getMyPlans → getTodayTasks → …），逐个铺开会把正文推得老远，
 * 而且真正要回答的问题（「AI 到底在干什么」）在铺开之后反而更难看出来。
 *
 * 默认折叠，**头部实时显示当前正在跑的那一步**——展开是为了回看，实时状态不该
 * 要求用户先点开。跑完的步骤按读/写分色：读工具压暗、写工具提亮并带上摘要，
 * 因为写工具动的是用户的真实数据。
 */
export function ToolCallBox({ parts }: { parts: ToolViewPart[] }) {
  const [open, setOpen] = useState(false);

  if (parts.length === 0) return null;

  const running = parts.find((part) => isRunning(part.state));
  const failures = parts.filter((part) => isFailed(part.state));
  const done = !running;

  // 折叠时头部显示什么：还在跑就显示当前这步；跑完了给个总数
  const head = running ?? parts.at(-1)!;
  const headText = running
    ? stepText(running)
    : failures.length > 0
      ? `${parts.length} 步 · ${failures.length} 个失败`
      : `调用了 ${parts.length} 个工具`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        failures.length > 0 ? "border-red-400/25 bg-red-400/[0.05]" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-white/[0.04]"
      >
        <StepIcon
          state={head.state}
          className={failures.length > 0 && done ? "text-red-300/80" : "text-white/45"}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12.5px]",
            failures.length > 0 && done ? "text-red-200/85" : "text-white/62"
          )}
        >
          {headText}
        </span>
        <CaretDown
          className={cn(
            "size-3 shrink-0 text-white/35 transition-transform",
            open && "rotate-180"
          )}
          weight="bold"
        />
      </button>

      {open ? (
        <ol className="space-y-1 border-t border-white/[0.07] px-3 py-2">
          {parts.map((part, index) => {
            const { kind } = toolUi(part.toolName);
            const failed = isFailed(part.state);
            return (
              <li
                key={part.toolCallId || index}
                className={cn(
                  "flex items-center gap-2 text-[12px]",
                  failed ? "text-red-300/80" : kind === "write" ? "text-white/72" : "text-white/38"
                )}
              >
                <StepIcon state={part.state} />
                <span className="truncate">{stepText(part)}</span>
                {part.summary ? (
                  <span className="truncate text-white/28">{part.summary}</span>
                ) : null}
                {part.errorText ? (
                  <span className="truncate text-red-300/70">{part.errorText}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
