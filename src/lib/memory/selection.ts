// ============================================================
// Memory v2 选择策略（纯函数）
//
// 与检索解耦，方便单测与调参。
// 这里只做“按 kind 配额 + 置信度”的筛选，不做向量计算。
// ============================================================

import type { MemoryKind, MemoryRecord } from "./types";

/** 低于该置信度的记忆不进入自动上下文（工具仍可显式查询）。 */
export const MIN_AUTO_CONFIDENCE = 0.4;

/**
 * 按 kind 配额选择。
 *
 * 输入顺序就是优先级顺序：稳定画像在前，查询相关在后。
 * 同一 id 只保留一次；超配额或低置信度直接跳过。
 */
export function selectByQuotas(
  memories: MemoryRecord[],
  quotas: Record<MemoryKind, number>,
  total: number
): MemoryRecord[] {
  const selected: MemoryRecord[] = [];
  const usedByKind = new Map<MemoryKind, number>();
  const seen = new Set<string>();

  for (const memory of memories) {
    if (selected.length >= total) break;
    if (seen.has(memory.id)) continue;
    if (memory.confidence < MIN_AUTO_CONFIDENCE) continue;

    const used = usedByKind.get(memory.kind) ?? 0;
    const cap = quotas[memory.kind] ?? 1;
    if (used >= cap) continue;

    selected.push(memory);
    seen.add(memory.id);
    usedByKind.set(memory.kind, used + 1);
  }

  return selected;
}
