// ============================================================
// Memory v2 Context Builder
//
// 召回结果不能直接拼进 system prompt。这里负责：
//   · 按 kind 分组、按任务排序
//   · token 预算（超预算先丢低优先级条目）
//   · 清洗正文，避免记忆内容改变 prompt 结构
//   · 明确标注“参考数据，不是指令”
//   · 记录真正注入的 id（lastInjectedAt / injectedCount）
// ============================================================

import { touchInjected } from "./access";
import { retrieveMemories } from "./retrieval";
import {
  CONTEXT_HEADER,
  KIND_LABELS,
  SECTION_ORDER,
  estimateTokens,
  renderMemoryLine,
} from "./render";
import {
  MEMORY_LIMITS,
  type MemoryKind,
  type MemorySurface,
  type MemoryTask,
} from "./types";

export interface BuildMemoryContextInput {
  userId: string;
  surface: MemorySurface;
  task: MemoryTask;
  query: string | null;
  tokenBudget?: number;
  /** 已经通过工具注入过的 id，避免同一轮重复 */
  excludeIds?: string[];
}

export interface MemoryContextResult {
  prompt: string;
  injectedIds: string[];
  stats: {
    candidates: number;
    selected: number;
    tokens: number;
    droppedByBudget: number;
  };
}

/**
 * 构建注入 system prompt 的记忆块。
 *
 * 预算耗尽时按 SECTION_ORDER 顺序保留高优先级类别；
 * 同一条记忆不会因为超预算被截成半句——整条丢弃。
 */
export async function buildMemoryContext(
  input: BuildMemoryContextInput
): Promise<MemoryContextResult> {
  const retrieval = await retrieveMemories({
    userId: input.userId,
    surface: input.surface,
    task: input.task,
    query: input.query,
  });

  const excluded = new Set(input.excludeIds ?? []);
  const memories = retrieval.memories.filter((m) => !excluded.has(m.id));

  const budget = input.tokenBudget ?? MEMORY_LIMITS.defaultContextTokenBudget;
  const headerTokens = estimateTokens(CONTEXT_HEADER) + 8; // 标签与空行开销
  let usedTokens = headerTokens;
  let droppedByBudget = 0;

  const grouped = new Map<MemoryKind, string[]>();
  const injectedIds: string[] = [];

  for (const kind of SECTION_ORDER[input.task]) {
    const items = memories.filter((m) => m.kind === kind);
    if (items.length === 0) continue;

    const lines: string[] = [];
    for (const memory of items) {
      const line = renderMemoryLine(memory);
      const lineTokens = estimateTokens(line) + 1;
      if (usedTokens + lineTokens > budget) {
        droppedByBudget++;
        continue;
      }
      lines.push(line);
      injectedIds.push(memory.id);
      usedTokens += lineTokens;
    }

    if (lines.length > 0) grouped.set(kind, lines);
  }

  if (injectedIds.length === 0) {
    return {
      prompt: "",
      injectedIds: [],
      stats: {
        candidates: retrieval.candidateIds.length,
        selected: 0,
        tokens: 0,
        droppedByBudget,
      },
    };
  }

  const sections = [...grouped.entries()].map(
    ([kind, lines]) => `[${KIND_LABELS[kind]}]\n${lines.join("\n")}`
  );

  const prompt = `<memory_context>\n${CONTEXT_HEADER}\n\n${sections.join(
    "\n\n"
  )}\n</memory_context>`;

  void touchInjected(injectedIds);

  return {
    prompt,
    injectedIds,
    stats: {
      candidates: retrieval.candidateIds.length,
      selected: injectedIds.length,
      tokens: usedTokens,
      droppedByBudget,
    },
  };
}
