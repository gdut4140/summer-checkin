// 文档工作室：在已渲染的阅读面板中高亮搜索匹配项
// 直接操作 DOM 文本节点，避免每次搜索都重新解析整篇 Markdown。

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
