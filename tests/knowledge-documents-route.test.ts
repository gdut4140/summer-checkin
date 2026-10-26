import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/knowledge-upload", () => ({ processKnowledgeText: vi.fn() }));
vi.mock("@/lib/knowledge-docs", () => ({ listKnowledgeDocs: vi.fn() }));

import { POST } from "@/app/api/knowledge/documents/route";
import { getAuthUser } from "@/lib/auth-utils";
import { processKnowledgeText } from "@/lib/knowledge-upload";
import { MAX_FILE_BYTES } from "@/lib/knowledge-upload-guard";

const mockAuth = vi.mocked(getAuthUser);
const mockProcess = vi.mocked(processKnowledgeText);

function multipartRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/knowledge/documents", {
    method: "POST",
    body: form,
  });
}

async function call(file: File) {
  const res = await POST(
    multipartRequest(file) as unknown as Parameters<typeof POST>[0]
  );
  return { status: res.status, body: await res.json() };
}

describe("POST /api/knowledge/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ id: "u1" } as never);
    mockProcess.mockResolvedValue({
      success: true,
      sourceName: "ok.txt",
      chunks: 1,
      replacedChunks: 0,
    });
  });

  it("未登录 → 401", async () => {
    mockAuth.mockResolvedValue(null);
    const { status } = await call(new File(["够长的测试文本"], "ok.txt"));
    expect(status).toBe(401);
  });

  it("文件超过大小上限 → 413，且不进入入库管道", async () => {
    const big = new File(
      [new Uint8Array(MAX_FILE_BYTES + 1)],
      "big.txt",
      { type: "text/plain" }
    );

    const { status, body } = await call(big);

    expect(status).toBe(413);
    expect(body.error).toContain("10 MB");
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("正常文件 → 交给入库管道，返回 201", async () => {
    const { status } = await call(
      new File(["这是足够长的测试文本内容"], "ok.txt", { type: "text/plain" })
    );

    expect(status).toBe(201);
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceName: "ok.txt", sourceType: "text" })
    );
  });
});
