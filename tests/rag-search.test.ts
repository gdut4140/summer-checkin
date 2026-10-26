import { beforeEach, describe, expect, it, vi } from "vitest";

// searchKnowledge 是「向量召回 → 重排 → 标注分数来源」的编排层。
// 这里锁的是三件容易被改坏的事：
//   1. 重排成功时 score 用重排分、scoreSource 标 rerank，recallScore 仍保留余弦
//   2. 重排降级（返回 null）时退回向量序，scoreSource 必须标 vector，不能伪装成 rerank
//   3. userId 必须一路传到召回 SQL 和计数查询（隔离在查询层）

vi.mock("@/lib/prisma", () => ({
  prisma: { documentChunk: { count: vi.fn() } },
}));
vi.mock("@/lib/rag/client", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/rag/retriever", () => ({ searchSimilarChunks: vi.fn() }));
vi.mock("@/lib/rag/rerank", () => ({ rerankChunks: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { embedText } from "@/lib/rag/client";
import { searchSimilarChunks } from "@/lib/rag/retriever";
import type { DocChunk } from "@/lib/rag/retriever";
import { rerankChunks } from "@/lib/rag/rerank";
import { searchKnowledge } from "@/lib/rag/search";

const mockEmbed = vi.mocked(embedText);
const mockRecall = vi.mocked(searchSimilarChunks);
const mockRerank = vi.mocked(rerankChunks);
const mockCount = vi.mocked(prisma.documentChunk.count);

function chunk(id: string, content: string, similarity: number): DocChunk {
  return {
    id,
    sourceName: "笔记.md",
    sourceType: "markdown",
    chunkIndex: Number(id.replace(/\D/g, "")) || 0,
    content,
    createdAt: new Date("2026-10-22"),
    similarity,
  };
}

function recalled(n = 10): DocChunk[] {
  return Array.from({ length: n }, (_, i) =>
    chunk(`c${i}`, `内容${i}`, 0.9 - i * 0.01)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue([1, 0, 0]);
  mockCount.mockResolvedValue(42 as never);
  mockRecall.mockResolvedValue([] as never);
});

describe("searchKnowledge 的分数来源与降级", () => {
  it("重排成功 → score 用重排分，scoreSource=rerank，recallScore 保留余弦", async () => {
    const candidates = recalled();
    const reversed = [...candidates].reverse();
    mockRecall.mockResolvedValue(candidates as never);
    mockRerank.mockResolvedValue({
      ordered: reversed,
      model: "qwen3-rerank",
      scoreById: new Map(reversed.map((c, i) => [c.id, 1 - i * 0.1])),
    });

    const out = await searchKnowledge("查询", "u1", 5);

    expect(mockRerank).toHaveBeenCalledTimes(1);
    expect(out.rerankModel).toBe("qwen3-rerank");
    expect(out.recalledChunks).toBe(10);
    expect(out.searchedChunks).toBe(42);

    const top = out.results[0];
    expect(top.content).toBe("内容9");
    expect(top.scoreSource).toBe("rerank");
    expect(top.score).toBeCloseTo(1);
    expect(top.recallScore).toBeCloseTo(0.81);
  });

  it("重排降级（返回 null）→ 回退向量序，scoreSource=vector 且不标 rerankModel", async () => {
    mockRecall.mockResolvedValue(recalled() as never);
    mockRerank.mockResolvedValue(null);

    const out = await searchKnowledge("查询", "u1", 5);

    expect(mockRerank).toHaveBeenCalledTimes(1);
    expect(out.rerankModel).toBeUndefined();
    for (const result of out.results) {
      expect(result.scoreSource).toBe("vector");
      // 降级时 score 必须就是余弦，而不是某个残留的重排分
      expect(result.score).toBeCloseTo(result.recallScore);
    }
  });

  it("候选不比 topK 多 → 跳过重排（省一次网络往返）", async () => {
    mockRecall.mockResolvedValue(recalled(3) as never);

    const out = await searchKnowledge("查询", "u1", 5);

    expect(mockRerank).not.toHaveBeenCalled();
    expect(out.results.every((r) => r.scoreSource === "vector")).toBe(true);
  });

  it("userId 传到召回 SQL 与计数查询（隔离在查询层）", async () => {
    mockRecall.mockResolvedValue(recalled(3) as never);

    await searchKnowledge("查询", "u1", 5, "笔记.md");

    // 召回池是 max(topK, 20)
    expect(mockRecall).toHaveBeenCalledWith([1, 0, 0], 20, "笔记.md", "u1");
    expect(mockCount).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("没有召回结果 → 直接返回空，不调用重排", async () => {
    mockRecall.mockResolvedValue([] as never);

    const out = await searchKnowledge("查询", "u1", 5);

    expect(out.results).toEqual([]);
    expect(out.recalledChunks).toBe(0);
    expect(mockRerank).not.toHaveBeenCalled();
  });
});
