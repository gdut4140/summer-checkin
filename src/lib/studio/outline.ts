// 文档工作室：从 Markdown 提取标题目录（大纲）
// Phase 0 先用正则实现，Phase 1 视需要换为从编辑器状态提取（带滚动定位）

export interface HeadingInfo {
  level: number; // 1-6
  text: string;
  line: number; // 从 0 开始的行号
}

export function extractHeadings(markdown: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2],
        line: i,
      });
    }
  }
  return headings;
}
