import { describe, expect, it } from "vitest";
import { formatKnowledgeDocList, type KnowledgeDocSummary } from "@/lib/knowledge-docs";

function doc(sourceName: string, chunkCount = 10): KnowledgeDocSummary {
  return {
    sourceName,
    sourceType: "markdown",
    chunkCount,
    totalChars: chunkCount * 100,
    createdAt: new Date("2026-09-23"),
  };
}

// 这个格式化的产物是模型对「知识库里有什么」的**唯一依据**。
// 真实故障：用户上传了 4 个文档，问「我的知识库有什么」，模型回答「只有一个文档」。
// 所以这里锁的不是措辞，是「一个都不能漏、总数必须对得上」。

describe("formatKnowledgeDocList", () => {
  it("空知识库 → 明确说空，而不是给一段空列表", () => {
    const s = formatKnowledgeDocList([]);
    expect(s).toContain("空");
    expect(s).not.toMatch(/共有 0 个/);
  });

  it("单个文档 → 条数与内容都对", () => {
    const s = formatKnowledgeDocList([doc("PLAN.md", 79)]);
    expect(s).toContain("共有 1 个文档");
    expect(s).toContain("PLAN.md");
    expect(s).toContain("79");
  });

  // 核心回归：4 个文档必须全部出现，且总数必须是 4
  it("多个文档 → 一个不漏，且总数与实际条数一致", () => {
    const docs = [
      doc("PLAN.md", 79),
      doc("小平软件组前端考核.md", 16),
      doc("个人简历.docx", 5),
      doc("基于 IM 的办公协同智能助手 （公开版）(2)(2).docx", 4),
    ];
    const s = formatKnowledgeDocList(docs);

    for (const d of docs) expect(s).toContain(d.sourceName);
    expect(s).toContain("共有 4 个文档");

    // 逐条编号：出现 1. 2. 3. 4.，且没有第 5 条
    for (const n of [1, 2, 3, 4]) expect(s).toContain(`${n}. `);
    expect(s).not.toContain("5. ");

    // 末尾再报一次总数，让模型没有数错的余地
    expect(s.match(/4 个文档/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("每个文档都带上类型/片段数/字数，便于模型回答细节", () => {
    const s = formatKnowledgeDocList([doc("a.md", 12)]);
    expect(s).toContain("markdown");
    expect(s).toContain("12 个片段");
    expect(s).toContain("1200 字");
  });
});
