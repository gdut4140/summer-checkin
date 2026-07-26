// ============================================================
// Day 16 RAG: 文本分片工具
//
// 两种策略:
//   ① splitText       — 固定大小 + 重叠（通用，适合纯文本/PDF）
//   ② splitMarkdown   — 按 ## 标题语义分片（适合 Markdown）
//
// bge-m3 最大输入 8192 tokens，默认 chunk 500 字留足余量
// ============================================================

/**
 * 固定大小 + 重叠分片
 *
 * @param text      原始文本
 * @param chunkSize 每个 chunk 的字数（默认 500）
 * @param overlap   相邻 chunk 重叠字数（默认 50）
 * @returns 分片后的文本数组
 */
export function splitText(
  text: string,
  chunkSize = 500,
  overlap = 50
): string[] {
  if (!text || text.trim().length === 0) return [];

  // 先按段落分割，避免在句子中间切断
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 短段落直接作为一个 chunk
    if (trimmed.length <= chunkSize) {
      chunks.push(trimmed);
      continue;
    }

    // 长段落按固定大小切分
    let start = 0;
    while (start < trimmed.length) {
      const end = Math.min(start + chunkSize, trimmed.length);
      let chunk = trimmed.slice(start, end);

      // 尽量在句号、问号、感叹号处断开（中文+英文）
      if (end < trimmed.length) {
        for (const sep of ["。", "？", "！", ".", "?", "!"]) {
          const lastSep = chunk.lastIndexOf(sep);
          if (lastSep > chunkSize * 0.6) {
            chunk = chunk.slice(0, lastSep + 1);
            break;
          }
        }
      }

      chunk = chunk.trim();
      if (!chunk) break; // 安全兜底

      chunks.push(chunk);

      // 确保 start 始终前进（防止死循环）
      const advance = chunk.length - overlap;
      start += advance > 0 ? advance : 1;
    }
  }

  console.log(`[Chunk] ${text.length} 字 → ${chunks.length} 个分片 (size=${chunkSize}, overlap=${overlap})`);
  return chunks;
}

/**
 * 按 Markdown 标题（## 级别）语义分片
 *
 * 适合结构良好的 Markdown 文档，每个 ## 段落为一个 chunk。
 * 如果某个段落过长，内部再用 splitText 切分。
 */
export function splitMarkdown(text: string, maxChunkSize = 800): string[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: string[] = [];

  // 按 ## 标题分割
  const sections = text.split(/\n(?=## )/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChunkSize) {
      chunks.push(trimmed);
    } else {
      // 保留标题行，对正文做固定大小切分
      const lines = trimmed.split("\n");
      const heading = lines[0];
      const body = lines.slice(1).join("\n");
      const bodyChunks = splitText(body, maxChunkSize, 50);
      bodyChunks.forEach((bc) => chunks.push(`${heading}\n${bc}`));
    }
  }

  console.log(`[Chunk] Markdown ${text.length} 字 → ${chunks.length} 个分片`);
  return chunks;
}
