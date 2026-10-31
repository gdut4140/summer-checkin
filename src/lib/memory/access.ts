// ============================================================
// Memory v2 访问信号
//
// 三种行为分开记录，避免再出现 v1 里“注入 = 使用”的语义混淆：
//   retrieved  进入候选池
//   injected   真正进入上下文
//   tool_read  模型通过 recall_memories 主动读取
//
// 这些更新失败不能影响主流程，所以统一 catch + warn。
// ============================================================

import { prisma } from "@/lib/prisma";
import type { MemoryAccessKind } from "./types";

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function touchRetrieved(ids: string[]): Promise<void> {
  const unique = dedupe(ids);
  if (unique.length === 0) return;
  try {
    await prisma.memory.updateMany({
      where: { id: { in: unique }, status: "active" },
      data: { lastRetrievedAt: new Date() },
    });
  } catch (error) {
    console.warn("[Memory] touchRetrieved 失败:", error);
  }
}

export async function touchInjected(ids: string[]): Promise<void> {
  const unique = dedupe(ids);
  if (unique.length === 0) return;
  try {
    await prisma.memory.updateMany({
      where: { id: { in: unique }, status: "active" },
      data: {
        lastInjectedAt: new Date(),
        injectedCount: { increment: 1 },
      },
    });
  } catch (error) {
    console.warn("[Memory] touchInjected 失败:", error);
  }
}

export async function touchToolRead(ids: string[]): Promise<void> {
  const unique = dedupe(ids);
  if (unique.length === 0) return;
  try {
    await prisma.memory.updateMany({
      where: { id: { in: unique }, status: "active" },
      data: { toolReadCount: { increment: 1 } },
    });
  } catch (error) {
    console.warn("[Memory] touchToolRead 失败:", error);
  }
}

export async function touchAccess(
  kind: MemoryAccessKind,
  ids: string[]
): Promise<void> {
  switch (kind) {
    case "retrieved":
      return touchRetrieved(ids);
    case "injected":
      return touchInjected(ids);
    case "tool_read":
      return touchToolRead(ids);
  }
}
