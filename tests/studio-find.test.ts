import { describe, expect, it } from "vitest";
import { countMatches, stripMarkdownSyntax } from "@/lib/studio/find";

/**
 * 源级搜索的辅助函数测试
 *
 * 背景：文档阅读面板虚拟化后，没渲染的块在 DOM 里不存在，Ctrl+F 只查 DOM 会漏结果。
 * 改成先在 markdown 源串上统计命中数，再跳转定位。这里保证「统计口径」是对的——
 * 剥离语法符号之后，搜 `#`、`**` 这类东西不再命中一堆渲染后看不见的字符，
 * 而正文词句仍然找得到。
 */

describe("stripMarkdownSyntax", () => {
  it("剥离标题、强调、行内代码等语法符号", () => {
    const out = stripMarkdownSyntax("# 一级标题\n\n**粗体** 与 *斜体* 与 `代码` 与 ~~删除~~ 与 ==高亮==");
    expect(out).not.toContain("#");
    expect(out).not.toContain("*");
    expect(out).not.toContain("~~");
    expect(out).not.toContain("==");
    expect(out).not.toContain("`");
    expect(out).toContain("一级标题");
    expect(out).toContain("粗体");
    expect(out).toContain("斜体");
    expect(out).toContain("代码");
    expect(out).toContain("删除");
    expect(out).toContain("高亮");
  });

  it("链接与图片保留可见文字", () => {
    const out = stripMarkdownSyntax("看 [这个链接](https://example.com) 和 ![示意图](/a.png)");
    expect(out).toContain("这个链接");
    expect(out).toContain("示意图");
    expect(out).not.toContain("https://example.com");
    expect(out).not.toContain("](/a.png)");
  });

  it("围栏代码块内部原样保留", () => {
    const out = stripMarkdownSyntax("```ts\nconst a = **b**;\n```");
    // 代码里的 ** 渲染出来就是字面的 **，不能剥掉
    expect(out).toContain("const a = **b**;");
    expect(out).not.toContain("```");
  });

  it("引用前缀、列表标记、分隔线、表格竖线不参与匹配", () => {
    const out = stripMarkdownSyntax("> 引用内容\n\n- 列表项\n\n---\n\n| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(out).toContain("引用内容");
    expect(out).toContain("列表项");
    expect(out).not.toMatch(/^> /m);
    expect(out).not.toContain("- ");
    expect(out).not.toContain("---");
    // 表格只剩单元格文字，不含竖线
    expect(out).not.toContain("|");
    expect(out).toContain("a");
  });

  it("HTML 标签被剥掉但内容留下", () => {
    const out = stripMarkdownSyntax("<span>行内内容</span> 与 <u>下划线</u>");
    expect(out).toContain("行内内容");
    expect(out).toContain("下划线");
    expect(out).not.toContain("<span>");
  });
});

describe("countMatches", () => {
  it("大小写不敏感，与 DOM 高亮口径一致", () => {
    expect(countMatches("Hello hello HELLO", "hello")).toBe(3);
  });

  it("空查询返回 0", () => {
    expect(countMatches("abc", "")).toBe(0);
    expect(countMatches("abc", "   ")).toBe(0);
  });

  it("把查询当成纯文本而不是正则", () => {
    expect(countMatches("a.b a.b", ".")).toBe(2);
    expect(countMatches("a+b", "+")).toBe(1);
    expect(countMatches("(x)", "(")).toBe(1);
  });

  it("统计不重叠的出现次数", () => {
    expect(countMatches("aaaa", "aa")).toBe(2);
  });
});
