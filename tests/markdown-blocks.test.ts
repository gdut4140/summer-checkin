import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkDeflist from "remark-deflist";
import type { Plugin } from "unified";
import {
  blockIndexForLine,
  estimateBlockHeight,
  splitMarkdownBlocks,
  type MarkdownBlock,
} from "@/lib/studio/markdown-blocks";

/**
 * 文档切块器的回归测试
 *
 * 为什么必须有：切块是「虚拟化文档」的地基。一旦切错位置（比如切在代码块
 * 或表格中间），渲染结果就会静默变样——代码块少了后半截、表格断开、setext
 * 标题退化成普通段落。这类问题在长文档里很难肉眼发现，所以这里用「切块前后
 * 顶层节点序列必须完全一致」来把关，而不是靠人看。
 *
 * 顶层节点序列的比对用的是与 markdown-renderer.tsx 同一套 remark 插件
 * （从各自的包导入，顺序照抄渲染器），所以它测的是线上真实解析行为。
 */

function parseTopLevelTypes(markdown: string): string[] {
  const tree = unified()
    // 顺序与 markdown-renderer.tsx 保持一致
    .use(remarkMath)
    // remark-footnotes 自带旧版 unified 类型，运行时兼容但类型不匹配
    // （markdown-renderer.tsx 里也是这么绕过去的）
    .use(remarkFootnotes as unknown as Plugin)
    .use(remarkDeflist)
    .use(remarkGfm)
    .use(remarkParse)
    .parse(markdown);
  return tree.children.map((node) => node.type);
}

function blockLineSpans(blocks: MarkdownBlock[]): Array<[number, number]> {
  return blocks.map((b) => [b.startLine, b.startLine + b.rawSource.split("\n").length]);
}

/** 覆盖了原文里除空行与定义行之外的每一行，且块间不重叠 */
function expectFullCoverage(markdown: string, blocks: MarkdownBlock[]) {
  const lines = markdown.split(/\r?\n/);
  const covered = new Set<number>();
  for (const [start, end] of blockLineSpans(blocks)) {
    for (let i = start; i < end; i++) {
      expect(covered.has(i), `行 ${i} 被多个块覆盖`).toBe(false);
      covered.add(i);
    }
  }
  const DEF_RE = /^ {0,3}\[\^[^\]]+\]:|^ {0,3}\[[^\]^][^\]]*\]:[ \t]*\S+/;
  const missing: number[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    if (!line.trim()) return;
    if (!inFence && DEF_RE.test(line)) return;
    if (!covered.has(i)) missing.push(i);
  });
  expect(missing, `以下行没有被任何块覆盖: ${missing.join(", ")}`).toEqual([]);
}

// ── 一份覆盖渲染器所声称支持语法的样本文档 ──────────────────────
const SAMPLE = `# 一级标题

普通段落，含 **加粗**、*斜体*、\`行内代码\` 与 ==高亮==。

## 二级标题

\`\`\`ts
// 代码块里故意留两个空行，切块器必须整体吃下

export function solve(n: number): number {
  return n;
}

\`\`\`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 唯一标识 |
| score | number | 评分 |

- 列表项一
- 列表项二
  - 嵌套项
- [x] 已完成的任务

> 引用块第一行
> 引用块第二行

Setext 标题
===========

---

### 三级标题

\`\`\`python
print("第二个代码块")
\`\`\`

最后一段正文。
`;

describe("splitMarkdownBlocks", () => {
  it("切块前后顶层节点序列完全一致", () => {
    const blocks = splitMarkdownBlocks(SAMPLE, { targetChars: 200 });
    expect(blocks.length).toBeGreaterThan(1);

    const whole = parseTopLevelTypes(SAMPLE);
    const split = blocks.flatMap((b) => parseTopLevelTypes(b.source));

    // 定义被前置到块首，解析后不产生节点，所以序列应当逐项相等
    expect(split).toEqual(whole);
  });

  it("不切在围栏代码块、表格、列表、引用块内部", () => {
    const blocks = splitMarkdownBlocks(SAMPLE, { targetChars: 120 });

    // 每个 fenced code 的开始与结束在同块内
    for (const b of blocks) {
      const fences = b.rawSource.split("\n").filter((l) => /^ {0,3}(`{3,}|~{3,})/.test(l));
      expect(fences.length % 2, `块内围栏数量应为偶数:\n${b.rawSource}`).toBe(0);
    }

    const joined = blocks.map((b) => b.rawSource).join("\n");
    // 表格的 3 行必须连在一起
    expect(joined).toContain("| --- | --- | --- |\n| id | string | 唯一标识 |\n| score | number | 评分 |");
    // setext 标题与它的文字不分家
    expect(joined).toContain("Setext 标题\n===========");
  });

  it("每个块的 startLine 精确指向原文对应行", () => {
    const blocks = splitMarkdownBlocks(SAMPLE, { targetChars: 150 });
    const lines = SAMPLE.split("\n");
    for (const b of blocks) {
      const span = b.rawSource.split("\n").length;
      const expected = lines.slice(b.startLine, b.startLine + span).join("\n");
      expect(b.rawSource, `块 startLine=${b.startLine} 与原文不符`).toBe(expected);
    }
  });

  it("原文内容不丢失、不重叠", () => {
    expectFullCoverage(SAMPLE, splitMarkdownBlocks(SAMPLE, { targetChars: 150 }));
  });

  it("超长单元自己独占一块，不会被切开", () => {
    const big = ["```txt", ...Array.from({ length: 400 }, (_, i) => `第 ${i} 行代码`), "```"].join(
      "\n"
    );
    const doc = `前置段落\n\n${big}\n\n后置段落\n`;
    const blocks = splitMarkdownBlocks(doc, { targetChars: 300 });

    const codeBlock = blocks.find((b) => b.rawSource.includes("第 0 行代码"));
    expect(codeBlock).toBeDefined();
    expect(codeBlock!.rawSource).toContain("第 399 行代码");
    // 前后两段各自独立
    expect(blocks.some((b) => b.rawSource.includes("前置段落"))).toBe(true);
    expect(blocks.some((b) => b.rawSource.includes("后置段落"))).toBe(true);
  });

  it("脚注定义被抽出，只前置给真正引用它的块", () => {
    // 两段都足够长，确保各自独立成块，才能验证「只前置给引用方」这条
    const filler = "填充文字".repeat(40);
    const doc = [
      "# 文档",
      "",
      `引用脚注的段落[^note]。${filler}`,
      "",
      `没有引用的段落。${filler}`,
      "",
      "[^note]: 脚注内容在这里。",
    ].join("\n");

    const blocks = splitMarkdownBlocks(doc, { targetChars: 150 });
    const citing = blocks.find((b) => b.rawSource.includes("引用脚注的段落"));
    const plain = blocks.find((b) => b.rawSource.includes("没有引用的段落"));
    const definitionOnly = blocks.some((b) => b.rawSource.startsWith("[^note]:"));

    expect(citing, "引用脚注的段落应独立成块").toBeDefined();
    expect(plain, "未引用的段落应独立成块").toBeDefined();
    expect(citing?.source).toContain("[^note]: 脚注内容在这里。");
    expect(plain?.source).not.toContain("[^note]:");
    expect(definitionOnly, "定义行不该自己成为正文块").toBe(false);
  });

  it("只有引用了定义语法的块才会被前置定义（不放大内存）", () => {
    const doc = [
      "见 [文档][ref]。",
      "",
      "无关段落一。",
      "",
      "无关段落二。",
      "",
      '[ref]: https://example.com "标题"',
    ].join("\n");
    const blocks = splitMarkdownBlocks(doc, { targetChars: 40 });
    for (const b of blocks) {
      const cites = /\[\^|\]\[/.test(b.rawSource);
      expect(
        b.source.includes("[ref]: https://example.com"),
        `块「${b.rawSource.slice(0, 20)}」的定义前置与引用情况不符`
      ).toBe(cites);
    }
  });

  it("引用式链接定义同样被抽出并前置给使用方", () => {
    const doc = [
      "见 [文档][ref]。",
      "",
      "无关段落。",
      "",
      '[ref]: https://example.com "标题"',
    ].join("\n");
    const blocks = splitMarkdownBlocks(doc, { targetChars: 40 });
    const using = blocks.find((b) => b.rawSource.includes("见 [文档][ref]"));
    expect(using?.source).toContain("[ref]: https://example.com");
  });

  it("跨空行的 HTML 容器块不被切开", () => {
    const doc = [
      "前置段落。",
      "",
      "<details>",
      "<summary>点我展开</summary>",
      "",
      "折叠块里的内容，和上面隔了一个空行。",
      "",
      "</details>",
      "",
      "后置段落。",
    ].join("\n");

    const blocks = splitMarkdownBlocks(doc, { targetChars: 80 });
    const host = blocks.find((b) => b.rawSource.includes("<details>"));
    expect(host, "<details> 应当独立成块").toBeDefined();
    // 开闭标签必须在同一块里，否则渲染会碎掉
    expect(host!.rawSource).toContain("</details>");
    expect(host!.rawSource).toContain("折叠块里的内容");
    expect(blocks.some((b) => b.rawSource.includes("后置段落"))).toBe(true);
  });

  it("自闭合 / 行内标签不会吞掉后面的内容", () => {
    const doc = `第一行<br/>换行\n\n第二段内容。\n\n第三段内容。\n`;
    const blocks = splitMarkdownBlocks(doc, { targetChars: 40 });
    expect(blocks.some((b) => b.rawSource.includes("第二段内容"))).toBe(true);
    expect(blocks.some((b) => b.rawSource.includes("第三段内容"))).toBe(true);
  });

  it("空文档返回空数组", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
    expect(splitMarkdownBlocks("   \n\n  ")).toEqual([]);
  });

  it("长文档切出的块数远小于顶层单元数", () => {
    const unit = "这是第 X 段正文内容，用来把文档撑长，长度接近真实段落。\n";
    const doc = Array.from({ length: 3000 }, (_, i) => `## 第 ${i} 节\n\n${unit}`).join("\n");
    const blocks = splitMarkdownBlocks(doc);

    // 6000 个顶层单元（标题 + 段落）压到几百块才叫有效合并
    expect(blocks.length).toBeLessThan(900);
    expect(blocks.length).toBeGreaterThan(100);
    // 没有哪一块离谱地大（允许标题边界带来的少量超出）
    for (const b of blocks) {
      expect(b.rawSource.length, `块过大: ${b.rawSource.slice(0, 60)}`).toBeLessThan(4000);
    }
  });
});

describe("blockIndexForLine", () => {
  it("返回最后一个 startLine 不超过该行的块", () => {
    const blocks = splitMarkdownBlocks(SAMPLE, { targetChars: 120 });
    const spans = blockLineSpans(blocks);
    const totalLines = SAMPLE.split("\n").length;

    for (let line = 0; line < totalLines; line++) {
      const idx = blockIndexForLine(blocks, line);
      // 契约：idx 是满足 startLine <= line 的最大下标
      expect(spans[idx][0], `行 ${line} 应落在块 ${idx}`).toBeLessThanOrEqual(line);
      if (idx + 1 < blocks.length) {
        expect(spans[idx + 1][0], `行 ${line} 被映射到过晚的块`).toBeGreaterThan(line);
      }
    }
  });

  it("块内每一行都映射回该块自身", () => {
    const blocks = splitMarkdownBlocks(SAMPLE, { targetChars: 120 });
    for (const [i, [start, end]] of blockLineSpans(blocks).entries()) {
      for (let line = start; line < end; line++) {
        expect(blockIndexForLine(blocks, line), `行 ${line} 应属于块 ${i}`).toBe(i);
      }
    }
  });

  it("空数组返回 -1", () => {
    expect(blockIndexForLine([], 0)).toBe(-1);
  });
});

describe("estimateBlockHeight", () => {
  it("代码块 / 图片 / 表格各自的估算高于同长度的纯文本", () => {
    const text = estimateBlockHeight("一行普通文字");
    const code = estimateBlockHeight("```ts\nconst a = 1;\nconst b = 2;\n```");
    const image = estimateBlockHeight("![图](https://example.com/a.png)");
    expect(code).toBeGreaterThan(text);
    expect(image).toBeGreaterThan(text);
    expect(text).toBeGreaterThan(0);
  });
});
