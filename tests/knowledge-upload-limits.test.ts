import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_UPLOAD_LIMITS,
  getKnowledgeUploadLimit,
  isKnowledgeUploadTooLarge,
} from "@/lib/knowledge-upload-limits";

describe("knowledge upload limits", () => {
  it("uses smaller limits for text and larger limits for documents", () => {
    expect(getKnowledgeUploadLimit("md")).toBe(5 * 1024 * 1024);
    expect(getKnowledgeUploadLimit("txt")).toBe(5 * 1024 * 1024);
    expect(getKnowledgeUploadLimit("pdf")).toBe(20 * 1024 * 1024);
    expect(getKnowledgeUploadLimit("docx")).toBe(20 * 1024 * 1024);
  });

  it("allows the exact limit and rejects the first byte above it", () => {
    const limit = KNOWLEDGE_UPLOAD_LIMITS.pdf;
    expect(isKnowledgeUploadTooLarge("pdf", limit)).toBe(false);
    expect(isKnowledgeUploadTooLarge("pdf", limit + 1)).toBe(true);
  });

  it("leaves unsupported extensions to the route's format validation", () => {
    expect(getKnowledgeUploadLimit("zip")).toBeNull();
    expect(isKnowledgeUploadTooLarge("zip", Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
