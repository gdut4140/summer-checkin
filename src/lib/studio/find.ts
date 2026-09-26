// 文档工作室：文档内搜索（Ctrl+F）
//
// 两套东西配合工作，别混：
//   · 本文件上半部分：**源级**匹配统计。文档阅读面板做了虚拟化，没渲染的块
//     在 DOM 里根本不存在，只靠 DOM 找会漏掉大部分结果。所以在 markdown 源串上
//     统计总数与每个块的命中数，用来驱动「第几个 / 共几个」与跳转定位。
//   · 本文件下半部分：**DOM 级**高亮。定位到某个块之后，在该块已渲染的 DOM 里
//     包 <mark>，这样才能精确到具体那一次命中。
// 两者的计数不保证逐条对齐（跨文本节点的命中只能被 DOM 发现，被剥离的语法符号
// 只会在源级出现），所以定位时对下标做了越界兜底。

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 单行内联语法 → 渲染后大概会出现的纯文本 */
function stripInline(line: string): string {
  return line
    .replace(/^ {0,3}#{1,6}\s+/, "") // 标题前缀
    .replace(/^ {0,3}> ?/, "") // 引用前缀
    .replace(/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/, "") // 分隔线整行（\1 需要捕获组）
    .replace(/^ {0,3}\|?[\s:|-]+\|[\s:|-]*$/, "") // 表格分隔行
    .replace(/^ {0,3}(?:[-*+]|\d{1,9}[.)])\s+/, "") // 列表标记
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // 图片 → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 行内链接 → 文字
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1") // 引用式链接 → 文字
    .replace(/<[^>]*>/g, "") // HTML 标签（内容保留）
    .replace(/`([^`]*)`/g, "$1") // 行内代码
    .replace(/(\*\*|__|~~|==)(.*?)\1/g, "$2") // 成对强调
    .replace(/[*_]/g, "") // 残余强调符号
    .replace(/\|/g, " ") // 表格竖线
    .replace(/\$+/g, ""); // 公式定界符
}

/**
 * 把 Markdown 粗略还原成渲染后的纯文本，只用于**匹配计数与定位**。
 *
 * 目的很具体：让搜索 `#`、`**` 这类语法符号不再命中一堆渲染后看不见的东西，
 * 同时保留正文词句，让「共几个」和肉眼能看到的数量接近。
 * 围栏代码块内部原样保留——代码里的 `**` 渲染出来就是字面的 `**`。
 */
export function stripMarkdownSyntax(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const raw of markdown.split("\n")) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(raw)) {
      inFence = !inFence; // 围栏行本身不产出文本
      continue;
    }
    out.push(inFence ? raw : stripInline(raw));
  }
  return out.join("\n");
}

/** 统计 query 在 text 里出现的次数（大小写不敏感，与 DOM 高亮口径一致） */
export function countMatches(text: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;
  return text.match(new RegExp(escapeRegExp(q), "gi"))?.length ?? 0;
}

/** 清除先前插入的 <mark> 高亮，恢复原文。 */
export function clearHighlights(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll("mark[data-studio-find]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

/** 在 root 内所有文本节点中查找 query，用 <mark> 包裹匹配项，返回匹配元素列表。 */
export function highlightMatches(root: HTMLElement | null, query: string): HTMLElement[] {
  clearHighlights(root);
  if (!root) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    // 跳过已包裹的高亮与脚本/样式节点；跨节点文本不匹配（可接受）
    if (node.parentElement?.closest("mark[data-studio-find], script, style")) continue;
    const text = node.textContent ?? "";
    const parts = text.split(regex);
    if (parts.length === 1) continue; // 无匹配
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (i % 2 === 1) {
        const mark = document.createElement("mark");
        mark.className = "studio-find";
        mark.setAttribute("data-studio-find", "true");
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode?.replaceChild(fragment, node);
  }
  return Array.from(root.querySelectorAll<HTMLElement>("mark[data-studio-find]"));
}
