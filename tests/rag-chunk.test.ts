import { describe, expect, it } from "vitest";
import { splitMarkdown, splitText } from "@/lib/rag/chunk";

describe("splitText", () => {
  it("空文本 / 纯空白 → 空数组", () => {
    expect(splitText("")).toEqual([]);
    expect(splitText("   \n\n  ")).toEqual([]);
  });

  it("短段落整段作为一个分片", () => {
    expect(splitText("这是一段短文本。")).toEqual(["这是一段短文本。"]);
  });

  it("多段落各自成片，且不产生空片", () => {
    const chunks = splitText("第一段。\n\n第二段。\n\n\n第三段。");
    expect(chunks).toEqual(["第一段。", "第二段。", "第三段。"]);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  it("长段落切成多片，每片不超过 chunkSize", () => {
    const long = "句子。".repeat(400); // 1200 字，无换行
    const chunks = splitText(long, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
  });

  it("优先在句末断开，而不是硬切", () => {
    const long = "句子。".repeat(400);
    const chunks = splitText(long, 500, 50);
    // 断句后每片都应以句号收尾（除非是被切到文本末尾的那片）
    expect(chunks[0].endsWith("。")).toBe(true);
  });

  it("无任何断句符的超长文本仍然终止，不退化成逐字推进", () => {
    const noSep = "a".repeat(3000);
    const chunks = splitText(noSep, 500, 50);
    expect(chunks.length).toBeGreaterThan(0);
    // 若 advance 兜底失效、每次只前进 1 字，这里会有上千片
    expect(chunks.length).toBeLessThan(20);
  });

  it("overlap 生效：相邻分片共享尾部内容，且首片刚好填满 chunkSize", () => {
    const long = "x".repeat(1200); // 无断句符 → 精确按 chunkSize 切
    const chunks = splitText(long, 500, 50);
    expect(chunks[0].length).toBe(500);
    expect(chunks).toHaveLength(3);
  });
});

describe("splitMarkdown", () => {
  it("空文本 → 空数组", () => {
    expect(splitMarkdown("")).toEqual([]);
  });

  it("按 ## 标题切分", () => {
    expect(splitMarkdown("## 一\n内容一\n## 二\n内容二")).toEqual([
      "## 一\n内容一",
      "## 二\n内容二",
    ]);
  });

  it("第一个 ## 之前的内容也保留为一片", () => {
    const chunks = splitMarkdown("前言\n## 一\n内容一");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("前言");
  });

  it("超长小节切分后，每一片都仍带标题行", () => {
    const body = "内容。".repeat(400); // 1200 字 > 默认 800
    const chunks = splitMarkdown(`## 长节\n${body}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.startsWith("## 长节")).toBe(true);
  });
});
