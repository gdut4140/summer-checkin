import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { SANITIZE_SCHEMA } from "@/components/ai/markdown-sanitize-schema";

/**
 * Markdown 渲染管线的净化回归测试
 *
 * 为什么必须有：渲染器开着 rehype-raw，而输入全是不可信内容——
 * AI 输出（可被 prompt injection 影响）、用户导入的 .md、聊天室里他人发的消息。
 * 白名单一旦被改错，这些内容就能往页面里注入原生 HTML。
 *
 * 这里用的是与 markdown-renderer.tsx 完全相同的插件顺序和白名单（从同一模块导入，
 * 不是另抄一份），所以它测的就是线上真实管线。
 */

const PIPELINE_MD = `
<details><summary>点我展开</summary>折叠内容</details>
<span>行内 span</span> 与 <u>下划线</u> 与 <mark>高亮</mark><br/>换行
<dl><dt>术语</dt><dd>解释</dd></dl>

行内 $E = mc^2$，块级：

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

<script>alert('xss-script')</script>
<img src="x" onerror="alert('xss-onerror')">
<iframe src="https://evil.example"></iframe>
<a href="javascript:alert('xss-js-url')">点我</a>
<style>body{display:none}</style>
<form action="https://evil.example"><input name="x"><button>提交</button></form>
<div onclick="alert('xss-onclick')">带事件的 div</div>
<svg><use href="#x"/></svg>
<object data="evil.swf"></object>
<mark onclick="alert(1)">带事件的 mark</mark>

| 列 | 值 |
|---|---|
| a | 1 |

- [ ] 待办
- [x] 完成
`;

// 与 markdown-renderer.tsx 的 rehypePlugins 顺序一致：raw → sanitize → katex → highlight
// （顺序是硬要求，sanitize 放到最后会清掉 KaTeX 的 style / MathML）
const pipeline = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, SANITIZE_SCHEMA)
  .use(rehypeKatex)
  .use(rehypeStringify);

const html = String(await pipeline.process(PIPELINE_MD));

describe("危险内容必须被清除", () => {
  const forbidden: Array<[string, string]> = [
    ["<script", "script 标签"],
    ["onerror", "onerror 事件属性"],
    ["onclick", "onclick 事件属性"],
    ["<iframe", "iframe 标签"],
    ["javascript:", "javascript: 协议 URL"],
    ["<style", "style 标签"],
    ["<form", "form 标签"],
    ["<object", "object 标签"],
    ["<svg", "svg 标签"],
  ];

  it.each(forbidden)("%s（%s）", (needle) => {
    expect(html).not.toContain(needle);
  });
});

describe("刻意支持的功能必须存活", () => {
  const required: Array<[string, string]> = [
    ["<details", "details 折叠块"],
    ["<summary", "summary 标题"],
    ["<mark", "mark 高亮"],
    ["<u", "u 下划线"],
    ["<br", "br 换行"],
    ["<dl", "定义列表"],
    ["katex", "KaTeX 渲染"],
    ["katex-display", "KaTeX 块级公式"],
    ["<table", "表格"],
    ['type="checkbox"', "任务列表复选框"],
  ];

  it.each(required)("%s（%s）", (needle) => {
    expect(html).toContain(needle);
  });
});

describe("属性剥离的精确性", () => {
  it("带事件属性的 mark 只留标签、不留属性", () => {
    expect(html.match(/<mark[^>]*>/)?.[0]).toBe("<mark>");
  });

  it("KaTeX 的 className 未被白名单误伤（否则公式会静默退化成纯文本）", () => {
    expect(html).toMatch(/<span class="katex[^"]*">/);
  });
});
