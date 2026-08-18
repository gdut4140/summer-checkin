"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFootnotes from "remark-footnotes";
import remarkDeflist from "remark-deflist";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { CheckSquare, Square } from "@phosphor-icons/react";
import type { Pluggable } from "unified";

interface Props {
  content: string;
}

/**
 * 完整 Markdown 渲染器（适用于阅读面板和 AI 回答）
 *
 * 覆盖语法（对应测试文档 1-13）：
 *  1. H1-H6 标题
 *  2. 粗体/斜体/删除线/==高亮mark==/行内代码/下划线 HTML/嵌套引用块
 *  3. 无序/有序/任务列表（- [ ] / - [x]）
 *  4. 表格（对齐）
 *  5. ```代码块 + highlight.js 语法高亮
 *  6. --- 分割线
 *  7. 链接 & 图片
 *  8. 行内 HTML（<span>, <br>, <details> 等原生透传，rehype-raw 解析）
 *  9. [^note] 脚注（remark-footnotes，渲染到文末）
 * 10. 定义列表（术语 + : 解释）
 * 11. <details><summary> 折叠块（原生 HTML，由 rehype-raw 透传）
 * 12. $行内$ + $$块$$ LaTeX（KaTeX 渲染）
 * 13. 引用式链接 [text][ref] + [ref]: url "title"
 *
 * 所有颜色使用 CSS 变量，配合 data-preset 主题切换。
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: Props) {
  // 预处理：==高亮== → <mark>高亮</mark>
  // remark-mark 是个 npm 上的空包（0.0.0），无法使用；
  // 改用字符串预处理，配合 rehype-raw 让 <mark> 被解析成真实节点
  const processed = useMemo(() => {
    // 简单安全：只匹配单行内的 ==text==，避免误伤代码块（代码块里很少用 ==）
    return content.replace(/(?<![=])==([^=\n]+)==(?![=])/g, "<mark>$1</mark>");
  }, [content]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[
          // 顺序关键：math 必须在 breaks/gfm 之前，否则 $...$ 会被换行/GFM 吞掉
          remarkMath,
          // remark-footnotes 内置了旧版 unified 类型，运行时兼容但类型定义不兼容。
          remarkFootnotes as Pluggable,
          remarkDeflist,
          remarkGfm,
        ]}
        // 先解析原生 HTML，再让 KaTeX 接管 math 节点，避免两者互相覆盖。
        rehypePlugins={[
          rehypeRaw,
          [rehypeKatex, { throwOnError: false }],
          rehypeHighlight,
        ]}
        components={{
          // ────────────────────────────────────────────────────────
          // 2. 文本格式 & 段落
          // ────────────────────────────────────────────────────────
          p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,

          mark: ({ children }) => (
            <mark className="rounded-sm px-1" style={{
              backgroundColor: "var(--studio-mark-bg)",
              color: "var(--studio-mark-fg)",
            }}>
              {children}
            </mark>
          ),

          // 行内 HTML：<u> 下划线 — 原生会渲染，这里不需要额外组件
          // 但 ReactMarkdown 默认允许所有常见 HTML 标签

          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--studio-link)" }}
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {children}
            </a>
          ),

          blockquote: ({ children }) => (
            <blockquote
              className="my-4 rounded-r-md pl-4 italic"
              style={{
                borderLeft: "4px solid var(--studio-quote-border)",
                backgroundColor: "var(--studio-quote-bg)",
                color: "var(--studio-text-muted)",
              }}
            >
              {children}
            </blockquote>
          ),

          // ────────────────────────────────────────────────────────
          // 1. 标题（H1-H6 全部适配）
          // ────────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1
              className="text-3xl font-bold mt-8 mb-4 pb-2"
              style={{
                color: "var(--studio-heading)",
                borderBottom: "1px solid var(--studio-hr)",
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className="text-2xl font-bold mt-7 mb-3 pb-1"
              style={{
                color: "var(--studio-heading)",
                borderBottom: "1px solid var(--studio-hr)",
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-bold mt-6 mb-3" style={{ color: "var(--studio-heading)" }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-lg font-bold mt-5 mb-2" style={{ color: "var(--studio-heading)" }}>
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-base font-bold mt-4 mb-2" style={{ color: "var(--studio-heading)" }}>
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6
              className="text-sm font-bold mt-4 mb-2"
              style={{ color: "var(--studio-text-muted)" }}
            >
              {children}
            </h6>
          ),

          // ────────────────────────────────────────────────────────
          // 3. 列表：无序/有序/任务（任务列表自定义 checkbox 图标）
          // ────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="list-disc list-outside mb-4 space-y-1 pl-6 marker:text-[var(--studio-text-muted)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside mb-4 space-y-1 pl-6 marker:text-[var(--studio-text-muted)]">
              {children}
            </ol>
          ),
          li: ({ children, className }) => {
            // remark-gfm 会给任务列表项加 "task-list-item" 类名，并第一个子节点是 <input type="checkbox">
            if (className?.includes("task-list-item")) {
              return (
                <li className="task-list-item flex items-start gap-2 !list-none !pl-0 my-1">
                  {children}
                </li>
              );
            }
            return <li className="marker:text-inherit">{children}</li>;
          },
          input: ({ type, checked }) => {
            if (type === "checkbox") {
              // 任务列表的 checkbox：用 Phosphor 图标替换原生样式
              return checked ? (
                <CheckSquare
                  size={16}
                  weight="fill"
                  className="mt-[3px] shrink-0"
                  style={{ color: "var(--studio-link)" }}
                />
              ) : (
                <Square
                  size={16}
                  weight="regular"
                  className="mt-[3px] shrink-0"
                  style={{ color: "var(--studio-text-muted)" }}
                />
              );
            }
            return <input type={type} defaultChecked={checked} />;
          },

          // ────────────────────────────────────────────────────────
          // 4. 表格
          // ────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-md" style={{ border: "1px solid var(--studio-border)" }}>
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ backgroundColor: "var(--studio-th-bg)" }}>{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr style={{ borderBottom: "1px solid var(--studio-border)" }} className="last:border-b-0">
              {children}
            </tr>
          ),
          th: ({ children, style, ...props }) => (
            <th
              className="px-3 py-2 font-semibold text-left"
              style={{
                color: "var(--studio-heading)",
                borderRight: "1px solid var(--studio-border)",
                ...style,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td
              className="px-3 py-2 align-top"
              style={{
                color: "var(--studio-text)",
                borderRight: "1px solid var(--studio-border)",
                ...style,
              }}
            >
              {children}
            </td>
          ),

          // ────────────────────────────────────────────────────────
          // 5. 代码块 + 行内代码
          // ────────────────────────────────────────────────────────
          pre: ({ children }) => (
            <pre
              className="code-block my-5 rounded-lg overflow-x-auto text-sm leading-relaxed"
              style={{
                backgroundColor: "var(--studio-code-bg)",
                color: "var(--studio-code-text)",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="inline-code rounded px-1.5 py-0.5 text-[0.9em]"
                  style={{
                    backgroundColor: "var(--studio-code-inline-bg)",
                    color: "var(--studio-code-inline-text)",
                  }}
                >
                  {children}
                </code>
              );
            }
            // 代码块：保留 highlight.js 的语言类名用于 hljs 配色
            return <code className={className}>{children}</code>;
          },

          // ────────────────────────────────────────────────────────
          // 6. 分割线
          // ────────────────────────────────────────────────────────
          hr: () => (
            <hr
              className="my-8 border-0"
              style={{ borderTop: "1px solid var(--studio-hr)" }}
            />
          ),

          // ────────────────────────────────────────────────────────
          // 7. 图片（支持引用式和内联式）
          // ────────────────────────────────────────────────────────
          img: ({ src, alt }) => (
            <img
              src={src || undefined}
              alt={alt || ""}
              className="my-5 max-w-full rounded-lg"
              style={{ border: "1px solid var(--studio-border)" }}
              loading="lazy"
            />
          ),

          // ────────────────────────────────────────────────────────
          // 10. 定义列表（remark-deflist 会生成 <dl>/<dt>/<dd>）
          // ────────────────────────────────────────────────────────
          dl: ({ children }) => (
            <dl className="my-5 space-y-3">{children}</dl>
          ),
          dt: ({ children }) => (
            <dt
              className="font-bold"
              style={{ color: "var(--studio-heading)" }}
            >
              {children}
            </dt>
          ),
          dd: ({ children }) => (
            <dd
              className="ml-5 mt-1"
              style={{ color: "var(--studio-text)" }}
            >
              {children}
            </dd>
          ),

          // ────────────────────────────────────────────────────────
          // 9. 脚注：remark-footnotes 会给 section 加 data-footnotes
          //    以及 a.footnote-backref 返回箭头，给它们做主题样式
          // ────────────────────────────────────────────────────────
          section: ({ children, className, ...props }) => {
            if (className?.includes("footnotes")) {
              return (
                <section
                  data-footnotes
                  className="footnotes mt-12 pt-4"
                  style={{ borderTop: "1px solid var(--studio-hr)" }}
                  {...props}
                >
                  <h2
                    className="text-lg font-bold mb-3"
                    style={{ color: "var(--studio-heading)" }}
                  >
                    脚注
                  </h2>
                  {children}
                </section>
              );
            }
            return <section className={className} {...props}>{children}</section>;
          },

          // 行内脚注引用上标 [^1]
          sup: ({ children }) => (
            <sup className="text-[0.75em] align-top ml-0.5 font-medium" style={{ color: "var(--studio-link)" }}>
              {children}
            </sup>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
});
