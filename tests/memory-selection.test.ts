import { describe, expect, it } from "vitest";
import { selectByQuotas } from "@/lib/memory/selection";
import { estimateTokens, sanitizeMemoryContent } from "@/lib/memory/render";
import type { MemoryKind, MemoryRecord } from "@/lib/memory/types";

function memory(
  id: string,
  kind: MemoryKind,
  overrides: Partial<MemoryRecord> = {}
): MemoryRecord {
  return {
    id,
    userId: "u1",
    legacyId: null,
    kind,
    content: `${kind}-${id}`,
    normalizedKey: null,
    status: "active",
    importance: 0.5,
    confidence: 0.8,
    validFrom: null,
    validTo: null,
    lastConfirmedAt: new Date("2026-10-01"),
    lastRetrievedAt: null,
    lastInjectedAt: null,
    injectedCount: 0,
    toolReadCount: 0,
    supersedesId: null,
    sourceType: "user_statement",
    sourceConversationId: null,
    sourceMessageId: null,
    embeddingModel: null,
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
    deletedAt: null,
    ...overrides,
  };
}

const quotas: Record<MemoryKind, number> = {
  goal: 3,
  skill: 1,
  weakness: 1,
  preference: 1,
  habit: 1,
  fact: 1,
};

describe("selectByQuotas", () => {
  it("按输入顺序选择，并遵守每类配额", () => {
    const selected = selectByQuotas(
      [
        memory("g1", "goal"),
        memory("g2", "goal"),
        memory("g3", "goal"),
        memory("g4", "goal"),
        memory("s1", "skill"),
        memory("s2", "skill"),
        memory("f1", "fact"),
      ],
      quotas,
      10
    );
    expect(selected.map((m) => m.id)).toEqual([
      "g1",
      "g2",
      "g3",
      "s1",
      "f1",
    ]);
  });

  it("低置信度不进入自动上下文", () => {
    const selected = selectByQuotas(
      [
        memory("g1", "goal", { confidence: 0.39 }),
        memory("g2", "goal", { confidence: 0.4 }),
      ],
      quotas,
      10
    );
    expect(selected.map((m) => m.id)).toEqual(["g2"]);
  });

  it("同一 id 只保留一次", () => {
    const duplicated = memory("g1", "goal");
    const selected = selectByQuotas([duplicated, duplicated], quotas, 10);
    expect(selected).toHaveLength(1);
  });

  it("达到总数上限立即停止", () => {
    const selected = selectByQuotas(
      [memory("g1", "goal"), memory("g2", "goal"), memory("g3", "goal")],
      quotas,
      2
    );
    expect(selected).toHaveLength(2);
  });
});

describe("render helpers", () => {
  it("估算中文 token 时保守取 1.5 字/token", () => {
    expect(estimateTokens("一二三")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("清洗正文中的控制字符与 prompt 结构符号", () => {
    expect(sanitizeMemoryContent("  用 <script> 和 `代码`\n\n")).toBe(
      "用 script 和 代码"
    );
  });

  it("超长正文按 200 字截断", () => {
    expect(sanitizeMemoryContent("很".repeat(250))).toHaveLength(200);
  });
});
