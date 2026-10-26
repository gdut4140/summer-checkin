import { beforeEach, describe, expect, it, vi } from "vitest";

// 重排失败的三类处理必须区分开（见 rag/rerank.ts）：
//   · 超时 / 额度限流：暂时性，本次降级为向量序，**不熔断**，下次还会重试
//   · 协议 / 形状错误：会稳定复现，熔断，避免每次搜索都白付一次往返
// 现有 rag-rerank.test.ts 覆盖了额度与协议两类；这里专门锁超时分支，
// 用 mock 直接注入拒绝原因，避免依赖真实网络与超时时间。

vi.mock("@/lib/model-pool", () => ({
  rerankWithFallback: vi.fn(),
  isQuotaError: vi.fn(() => false),
}));

import { rerankWithFallback, isQuotaError } from "@/lib/model-pool";
import type { DocChunk } from "@/lib/rag/retriever";
import { __resetRerankDisabled, rerankChunks } from "@/lib/rag/rerank";

const mockRerank = vi.mocked(rerankWithFallback);
const mockQuota = vi.mocked(isQuotaError);

function chunk(): DocChunk {
  return {
    id: "c1",
    sourceName: "t.md",
    sourceType: "text",
    chunkIndex: 0,
    content: "片段内容",
    createdAt: new Date("2026-10-22"),
    similarity: 0.8,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRerankDisabled();
  mockQuota.mockReturnValue(false);
});

describe("rerankChunks 的超时降级", () => {
  it("超时 → 本次返回 null 但不熔断，下一次仍会重试", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    mockRerank.mockRejectedValue(
      Object.assign(new Error("aborted due to timeout"), {
        name: "TimeoutError",
      })
    );

    expect(await rerankChunks("查询", [chunk()])).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).toContain("超时");
    expect(error).not.toHaveBeenCalled();

    // 超时是暂时性的：第二次必须真正再发一次，而不是被熔断短路
    mockRerank.mockResolvedValue({
      data: [{ index: 0, score: 0.93 }],
      model: "qwen3-rerank",
    });
    const out = await rerankChunks("查询", [chunk()]);

    expect(mockRerank).toHaveBeenCalledTimes(2);
    expect(out?.model).toBe("qwen3-rerank");
    expect(out?.scoreById.get("c1")).toBe(0.93);

    warn.mockRestore();
    error.mockRestore();
  });

  it("限流类错误同样只降级、不熔断", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockQuota.mockReturnValue(true);
    mockRerank.mockRejectedValue(new Error("429 rate limit"));

    expect(await rerankChunks("查询", [chunk()])).toBeNull();

    mockRerank.mockResolvedValue({
      data: [{ index: 0, score: 0.5 }],
      model: "qwen3-rerank",
    });
    expect(await rerankChunks("查询", [chunk()])).not.toBeNull();
    expect(mockRerank).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it("协议类错误 → 熔断，后续调用不再发请求（与暂时性错误区分）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRerank.mockRejectedValue(new Error("unexpected response shape"));

    expect(await rerankChunks("查询", [chunk()])).toBeNull();
    expect(await rerankChunks("查询", [chunk()])).toBeNull();

    // 第二次被 rerankDisabled 短路，没有再进 model-pool
    expect(mockRerank).toHaveBeenCalledTimes(1);

    error.mockRestore();
  });
});
