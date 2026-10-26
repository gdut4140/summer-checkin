import { describe, expect, it } from "vitest";
import {
  KnowledgeLimitError,
  MAX_CHUNK_COUNT,
  MAX_FILE_BYTES,
  MAX_REQUEST_BYTES,
  MAX_TEXT_CHARS,
  PDF_PARSE_TIMEOUT_MS,
  assertChunkLimit,
  assertTextLimit,
  chunkCountError,
  describeExtractionError,
  fileSizeError,
  requestSizeError,
  textLengthError,
} from "@/lib/knowledge-upload-guard";

// 这些边界直接决定一次上传会烧多少 embedding 调用、占多少内存。
// 锁的是「恰好等于上限可以通过、超过一个字就拒绝」，避免以后改常量时改了半边。

describe("fileSizeError", () => {
  it("未超限 → null", () => {
    expect(fileSizeError(0)).toBeNull();
    expect(fileSizeError(MAX_FILE_BYTES)).toBeNull();
  });

  it("超过 1 字节 → 拒绝，并说明上限", () => {
    const message = fileSizeError(MAX_FILE_BYTES + 1);
    expect(message).toContain("文件过大");
    expect(message).toContain("10 MB");
  });
});

describe("requestSizeError", () => {
  it("缺失 / 0 / 非法 content-length → 放行（交给 file.size 检查）", () => {
    expect(requestSizeError(null)).toBeNull();
    expect(requestSizeError(0)).toBeNull();
    expect(requestSizeError(Number.NaN)).toBeNull();
  });

  it("超过请求体上限 → 拒绝", () => {
    expect(requestSizeError(MAX_REQUEST_BYTES)).toBeNull();
    expect(requestSizeError(MAX_REQUEST_BYTES + 1)).toContain("请求体过大");
  });
});

describe("textLengthError", () => {
  it("恰好等于上限 → 通过", () => {
    expect(textLengthError("字".repeat(MAX_TEXT_CHARS))).toBeNull();
  });

  it("超过上限 → 拒绝，并提示拆分", () => {
    const message = textLengthError("字".repeat(MAX_TEXT_CHARS + 1));
    expect(message).toContain("文本过长");
    expect(message).toContain(String(MAX_TEXT_CHARS));
    expect(message).toContain("拆分");
  });
});

describe("chunkCountError", () => {
  it("恰好等于上限 → 通过", () => {
    expect(chunkCountError(MAX_CHUNK_COUNT)).toBeNull();
  });

  it("超过上限 → 拒绝", () => {
    expect(chunkCountError(MAX_CHUNK_COUNT + 1)).toContain("分片过多");
  });

  it("assertChunkLimit 抛出可识别的上限错误", () => {
    expect(() => assertChunkLimit(MAX_CHUNK_COUNT)).not.toThrow();
    try {
      assertChunkLimit(MAX_CHUNK_COUNT + 1);
      throw new Error("应当抛错");
    } catch (err) {
      expect(err).toBeInstanceOf(KnowledgeLimitError);
      expect((err as KnowledgeLimitError).status).toBe(400);
    }
  });
});

describe("assertTextLimit", () => {
  it("超限时抛出 KnowledgeLimitError", () => {
    expect(() => assertTextLimit("字".repeat(MAX_TEXT_CHARS + 1))).toThrow(
      KnowledgeLimitError
    );
  });
});

describe("describeExtractionError", () => {
  it("超时 → 说明超时与秒数", () => {
    const message = describeExtractionError("pdf", "", {
      timedOut: true,
      fallback: "Command failed",
    });
    expect(message).toContain("超时");
    expect(message).toContain(String(PDF_PARSE_TIMEOUT_MS / 1000));
  });

  it("缺少 Python 依赖 → 明确提示，而不是回显 traceback", () => {
    const message = describeExtractionError(
      "docx",
      "Traceback (most recent call last):\nModuleNotFoundError: No module named 'docx'",
      { timedOut: false, fallback: "Command failed" }
    );
    expect(message).toContain("依赖未安装");
    expect(message).not.toContain("Traceback");
  });

  it("其他失败 → 取最后一行的具体错误，不整段回显", () => {
    const message = describeExtractionError(
      "pdf",
      "Traceback (most recent call last):\n  File \"x.py\", line 1\nValueError: bad file",
      { timedOut: false, fallback: "Command failed" }
    );
    expect(message).toContain("ValueError: bad file");
    expect(message).not.toContain("Traceback");
  });

  it("stderr 为空 → 使用 fallback", () => {
    const message = describeExtractionError("pdf", "", {
      timedOut: false,
      fallback: "spawn python ENOENT",
    });
    expect(message).toContain("spawn python ENOENT");
  });
});
