"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Props {
  content: string;
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 自定义代码块样式
          pre: ({ children }) => (
            <pre className="code-block">{children}</pre>
          ),
          // 自定义行内代码样式
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="inline-code">{children}</code>
              );
            }
            // 代码块：保留 highlight.js 的类名
            return <code className={className}>{children}</code>;
          },
          // 自定义段落间距
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          // 自定义列表样式
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1">
              {children}
            </ol>
          ),
          // 自定义标题样式
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold mb-2">{children}</h3>
          ),
          // 自定义链接样式
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              {children}
            </a>
          ),
          // 自定义引用块样式
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2 text-gray-600">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
