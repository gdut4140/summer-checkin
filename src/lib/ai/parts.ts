import {
  getToolName,
  isDynamicToolUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { toolUi } from "@/lib/tools/tool-ui";

/** UIMessage['parts'] 的元素类型。UIMessagePart 自身要两个泛型参数，这样取更省事 */
type AnyUIPart = UIMessage["parts"][number];

/**
 * 界面上流通的消息类型。
 *
 * 用 metadata 捎带 createdAt —— UIMessage 本身没有时间字段，而气泡右下角要显示
 * 「HH:mm」。放在 metadata 里（而不是客户端就地 new Date()）是为了让它**稳定**：
 * 否则每次重渲染都会取到新时间，分钟数可能在看的过程中自己跳。
 */
export type ChatUIMessage = UIMessage<{ createdAt?: string }>;

// ============================================================
// UIMessage.parts → 展示用的 ViewPart
//
// 只做一件事，但全链路都靠它，所以刻意只做这一件事：
//
//   落库    toViewParts(responseMessage.parts)  → 存进 ConversationMessage.parts
//   直播    toViewParts(useChat 消息的 parts)   → 交给 MessageBubble 渲染
//   历史    DTO 里的 parts 已经是 ViewPart[]    → 直接用
//
// 落库和渲染共用同一个函数，是为了不出现「刷新前后卡片长得不一样」的漂移——
// 这类不一致修起来极烦，因为两边都「看起来对」。
//
// 注意 ViewPart 是**展示**模型，不是 AI SDK 的传输模型：它去掉了 step-start、
// reasoning、file 等渲染用不上的部分，并把工具的 input/output 压成一条短摘要
// （理由见 tools/tool-ui.ts 顶部：updateDocument 的 input 是整篇文档）。
// 往返 AI SDK 的部分流因此不经过它——那条路走的是原始 UIMessagePart。
// ============================================================

/** AI SDK 的 ToolUIPart 状态全集 */
export type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export type ViewPart =
  | { type: "text"; text: string }
  | {
      type: "tool";
      toolName: string;
      toolCallId: string;
      state: ToolCallState;
      /** 落库/展示用的短摘要（由 tools/tool-ui.ts 的 summarize 算出） */
      summary?: string;
      errorText?: string;
    };

/** UIMessage 里的纯文本（拼接所有 text part） */
export function partsText(parts: readonly AnyUIPart[]): string {
  return parts.filter(isTextUIPart).map((part) => part.text).join("");
}

/** 消息的纯文本。用户消息落库、生成标题、拼 conversationHint 都用它 */
export function messageText(message: Pick<UIMessage, "parts">): string {
  return partsText(message.parts);
}

/** 流式过程中 input/output 可能还不存在，取不到就是 undefined */
function safeInput(part: AnyUIPart): unknown {
  return "input" in part ? (part as { input?: unknown }).input : undefined;
}

function safeOutput(part: AnyUIPart): unknown {
  return "output" in part ? (part as { output?: unknown }).output : undefined;
}

export function toViewParts(parts: readonly AnyUIPart[]): ViewPart[] {
  const out: ViewPart[] = [];
  for (const part of parts) {
    if (isTextUIPart(part)) {
      // 空 text part 不产生任何视觉，丢掉避免渲染出空段落
      if (part.text) out.push({ type: "text", text: part.text });
      continue;
    }
    if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) continue;

    const toolName = getToolName(part);
    const view: ViewPart = {
      type: "tool",
      toolName,
      toolCallId: part.toolCallId,
      state: part.state as ToolCallState,
    };
    const summary = toolUi(toolName).summarize?.(safeInput(part), safeOutput(part));
    if (summary) view.summary = summary;
    if (part.state === "output-error") view.errorText = part.errorText;
    out.push(view);
  }
  return out;
}

/** 从 ViewPart 里取纯文本（历史消息回传模型时用） */
export function viewPartsText(parts: readonly ViewPart[]): string {
  return parts
    .filter((part): part is Extract<ViewPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** DTO 里读出来的 parts 是不是我们认识的形状（旧行是 null） */
export function isViewParts(value: unknown): value is ViewPart[] {
  return (
    Array.isArray(value) &&
    value.every((part) => {
      if (part === null || typeof part !== "object") return false;
      const type = (part as { type?: unknown }).type;
      return type === "text" || type === "tool";
    })
  );
}

// ============================================================
// rawParts：保存 AI SDK 的原始 parts，用于后续轮次重建 tool-call/tool-result
//
// 与 ViewPart 的区别：ViewPart 只留展示摘要；rawParts 保留 input/output，
// 但单条超过上限时替换成截断占位对象，避免 updateDocument 的整篇文档反复入库。
// ============================================================

const RAW_TOOL_PAYLOAD_MAX_CHARS = 4_000;

function capPayload(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    const text = JSON.stringify(value);
    if (text.length <= RAW_TOOL_PAYLOAD_MAX_CHARS) return value;
    return {
      truncated: true,
      chars: text.length,
      preview: text.slice(0, 1_000),
    };
  } catch {
    return { truncated: true, preview: "[unserializable]" };
  }
}

/**
 * 裁剪并规范化 AI SDK 的 parts，只保留 text 和 tool-*。
 * 非法/未知 part 直接丢弃，避免把 step-start/reasoning 等无必要内容写库。
 */
export function sanitizeRawParts(parts: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const part of parts) {
    if (part === null || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";

    if (type === "text") {
      if (typeof record.text === "string" && record.text) {
        out.push({ type: "text", text: record.text });
      }
      continue;
    }

    if (!type.startsWith("tool-")) continue;
    out.push({
      type,
      toolCallId:
        typeof record.toolCallId === "string" ? record.toolCallId : undefined,
      state: typeof record.state === "string" ? record.state : "output-available",
      input: capPayload(record.input),
      output: capPayload(record.output),
      ...(typeof record.errorText === "string"
        ? { errorText: record.errorText }
        : {}),
    });
  }
  return out;
}

/**
 * 文本协议（studio 面板）没有 UIMessage.parts，从 streamText 的 steps 还原
 * 一份 rawParts，保证两个入口的历史都能保留工具调用配对。
 */
export function buildRawPartsFromSteps(steps: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  const byToolCallId = new Map<string, Record<string, unknown>>();

  for (const step of steps) {
    if (step === null || typeof step !== "object") continue;
    const record = step as {
      text?: unknown;
      toolCalls?: Array<{
        toolName?: unknown;
        toolCallId?: unknown;
        input?: unknown;
      }>;
      toolResults?: Array<{
        toolName?: unknown;
        toolCallId?: unknown;
        output?: unknown;
        isError?: unknown;
      }>;
    };

    if (typeof record.text === "string" && record.text) {
      out.push({ type: "text", text: record.text });
    }

    for (const call of record.toolCalls ?? []) {
      const toolName =
        typeof call.toolName === "string" ? call.toolName : "unknown";
      const toolCallId =
        typeof call.toolCallId === "string" ? call.toolCallId : undefined;
      const part: Record<string, unknown> = {
        type: `tool-${toolName}`,
        toolCallId,
        state: "input-available",
        input: capPayload(call.input),
      };
      out.push(part);
      if (toolCallId) byToolCallId.set(toolCallId, part);
    }

    for (const result of record.toolResults ?? []) {
      const toolCallId =
        typeof result.toolCallId === "string" ? result.toolCallId : undefined;
      const part = toolCallId ? byToolCallId.get(toolCallId) : undefined;
      if (!part) continue;
      part.state = result.isError ? "output-error" : "output-available";
      part.output = capPayload(result.output);
    }
  }

  return sanitizeRawParts(out);
}
