/* ============================================================
 * 文档阅读器：把整篇 Markdown 切成「可独立渲染的块」
 *
 * 为什么需要它：
 *   EditorPane 目前把整篇 markdown 交给一个 MarkdownRenderer，长文档
 *   （实测 3000 块 ≈ 2.4s、22501 个 DOM 节点）会把首屏和每次编辑拖垮。
 *   切成块之后，虚拟化只需要渲染视口附近的若干块；而且每个块的 source
 *   字符串独立，MarkdownRenderer 的 memo 能命中——改一个字符只重解析
 *   被改的那一块。
 *
 * 职责边界（重要）：
 *   这里不做 Markdown 解析，也不产出 AST。它只做一件事——找**安全边界**，
 *   把源串切开；每一块仍然交给现有的 MarkdownRenderer 渲染。
 *   安全边界 = 永远不切在围栏代码块 / 表格 / 列表 / 引用块 / 段落内部。
 *
 * 文档级定义的处理：
 *   脚注定义 `[^x]: ...` 和引用式链接定义 `[ref]: url` 在原文里通常写在文末，
 *   切块后引用它们的那一块会找不到定义。这里在扫描时把它们抽出来，再按需
 *   前置回**真正引用了定义**的那些块（没有引用的块不前置，避免无谓的内存放大）。
 *   已知取舍：脚注会被渲染到所在块的末尾，而不是整篇文档的末尾。
 * ============================================================ */

/** 一个可独立渲染的 Markdown 块 */
export interface MarkdownBlock {
  /** 块首行在原文中的行号（0 起），用于目录定位 / 搜索定位 */
  startLine: number;
  /** 交给 MarkdownRenderer 的源（可能已前置文档级定义） */
  source: string;
  /** 原文切片（不含前置定义），用于搜索与统计 */
  rawSource: string;
  /** 估算高度（px），仅供虚拟列表在块尚未渲染时占位 */
  estimatedHeight: number;
}

export interface SplitOptions {
  /** 目标块大小（字符）。约等于一屏正文，默认 1200 */
  targetChars?: number;
}

const DEFAULT_TARGET_CHARS = 1200;
// 下限只用来挡住 0 / 负数这类病态配置；测试里会用很小的值切细块
const MIN_TARGET_CHARS = 64;

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^ {0,3}#{1,6}(\s+.*)?$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const LIST_RE = /^( {0,3})(?:[-*+]|\d{1,9}[.)])(\s+.*)?$/;
const BLOCKQUOTE_RE = /^ {0,3}>/;
const TABLE_RE = /^ {0,3}\|/;
const MATH_FENCE_RE = /^ {0,3}\$\$[ \t]*$/;
// CommonMark HTML 块起始（保守覆盖最常见的几类）
const HTML_START_RE = /^ {0,3}<(?:[a-zA-Z][a-zA-Z0-9-]*|\/[a-zA-Z][a-zA-Z0-9-]*|!--|\?|!\[CDATA\[)/;
// 这些标签会跨多行包住内容，中途的空行不是块的边界
const HTML_CONTAINER_TAGS = new Set([
  "details", "div", "section", "article", "aside", "header", "footer", "main",
  "nav", "table", "ul", "ol", "dl", "figure", "pre", "form", "fieldset",
  "blockquote", "video", "audio", "iframe", "canvas", "svg",
]);
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^[^\]]+\]:/;
const LINK_DEF_RE = /^ {0,3}\[[^\]^][^\]]*\]:[ \t]*\S+/;

type UnitKind =
  | "paragraph"
  | "heading"
  | "code"
  | "table"
  | "list"
  | "quote"
  | "html"
  | "math"
  | "hr"
  | "definition";

interface Unit {
  kind: UnitKind;
  /** 起始行（0 起，含） */
  start: number;
  /** 结束行（不含） */
  end: number;
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function fenceCloser(marker: string, len: number): RegExp {
  const ch = marker === "`" ? "`" : marker === "~" ? "~" : "\\$";
  return new RegExp(`^ {0,3}${ch}{${len},}[ \\t]*$`);
}

/** 扫描出顶层「单元」序列。单元是切块的最小不可分单位。 */
function scanUnits(lines: string[]): Unit[] {
  const units: Unit[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行：跳过，段落天然在此断开
    if (!line.trim()) {
      i++;
      continue;
    }

    // ── 文档级定义（脚注 / 引用式链接）：单独抽走，不进正文块 ──
    if (FOOTNOTE_DEF_RE.test(line) || LINK_DEF_RE.test(line)) {
      // 定义可以带缩进续行，一并吃掉
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && indentOf(lines[j]) >= 2) j++;
      units.push({ kind: "definition", start: i, end: j });
      i = j;
      continue;
    }

    // ── 围栏代码块（``` / ~~~）──
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const close = fenceCloser(marker, fence[1].length);
      let j = i + 1;
      while (j < lines.length) {
        if (close.test(lines[j])) {
          j++;
          break;
        }
        j++;
      }
      units.push({ kind: "code", start: i, end: j });
      i = j;
      continue;
    }

    // ── 块级公式 $$ ... $$ ──
    if (MATH_FENCE_RE.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        if (MATH_FENCE_RE.test(lines[j])) {
          j++;
          break;
        }
        j++;
      }
      units.push({ kind: "math", start: i, end: j });
      i = j;
      continue;
    }

    // ── HTML 块 ──
    // 普通情况到空行为止（CommonMark 类型 1-6）。但如果这一行开启的是
    // <details> / <div> 这类容器标签且没在同一行闭合，就一路吃到对应的闭合标签——
    // 否则中间的空行会把块切开，出现「开标签在前一块、闭标签在后一块」的破碎渲染。
    // 找不到闭合标签时宁可整段不切（退化为不虚拟化），也不切坏。
    if (HTML_START_RE.test(line)) {
      const opened = /^ {0,3}<([a-zA-Z][a-zA-Z0-9-]*)\b/.exec(line);
      const tag = opened?.[1]?.toLowerCase();
      let j = i + 1;
      if (tag && HTML_CONTAINER_TAGS.has(tag)) {
        const close = new RegExp(`</${tag}\\s*>`, "i");
        if (!close.test(line)) {
          while (j < lines.length && !close.test(lines[j])) j++;
          if (j < lines.length) j++; // 吃掉闭合标签所在行
        } else {
          while (j < lines.length && lines[j].trim()) j++;
        }
      } else {
        while (j < lines.length && lines[j].trim()) j++;
      }
      units.push({ kind: "html", start: i, end: j });
      i = j;
      continue;
    }

    // ── 标题（单行单元，天然边界）──
    if (HEADING_RE.test(line)) {
      units.push({ kind: "heading", start: i, end: i + 1 });
      i++;
      continue;
    }

    // ── 表格：连续的 | 行 ──
    if (TABLE_RE.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && TABLE_RE.test(lines[j])) j++;
      units.push({ kind: "table", start: i, end: j });
      i = j;
      continue;
    }

    // ── 引用块：连续的 > 行 + 惰性续行 ──
    if (BLOCKQUOTE_RE.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (!l.trim()) break;
        if (BLOCKQUOTE_RE.test(l)) {
          j++;
          continue;
        }
        // 惰性续行：后面这行不是任何新块的开始，就仍属于本引用块
        if (
          HEADING_RE.test(l) ||
          FENCE_RE.test(l) ||
          LIST_RE.test(l) ||
          TABLE_RE.test(l) ||
          HTML_START_RE.test(l) ||
          HR_RE.test(l)
        ) {
          break;
        }
        j++;
      }
      units.push({ kind: "quote", start: i, end: j });
      i = j;
      continue;
    }

    // ── 列表：项 + 缩进续行 ──
    const list = LIST_RE.exec(line);
    if (list) {
      const markerIndent = list[1].length;
      const contentIndent = markerIndent + (list[2]?.length ?? 1) + 1;
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (!l.trim()) {
          // 空行只有后面仍是列表内容时才吃进来
          let k = j;
          while (k < lines.length && !lines[k].trim()) k++;
          if (k >= lines.length) break;
          const nextIndent = indentOf(lines[k]);
          if (LIST_RE.test(lines[k]) || nextIndent >= contentIndent) {
            j = k;
            continue;
          }
          break;
        }
        if (LIST_RE.test(l)) {
          j++;
          continue;
        }
        if (indentOf(l) >= contentIndent) {
          j++;
          continue;
        }
        break;
      }
      units.push({ kind: "list", start: i, end: j });
      i = j;
      continue;
    }

    // ── 分隔线 ──
    if (HR_RE.test(line)) {
      units.push({ kind: "hr", start: i, end: i + 1 });
      i++;
      continue;
    }

    // ── 段落：到空行为止；`---` / `===` 是 setext 标题，留在段内 ──
    {
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (!l.trim()) break;
        if (SETEXT_RE.test(l)) {
          // setext 下划线，属于本段
          j++;
          break;
        }
        if (
          HEADING_RE.test(l) ||
          FENCE_RE.test(l) ||
          LIST_RE.test(l) ||
          TABLE_RE.test(l) ||
          BLOCKQUOTE_RE.test(l) ||
          HTML_START_RE.test(l) ||
          HR_RE.test(l) ||
          MATH_FENCE_RE.test(l) ||
          FOOTNOTE_DEF_RE.test(l)
        ) {
          break;
        }
        j++;
      }
      units.push({ kind: "paragraph", start: i, end: j });
      i = j;
    }
  }

  return units;
}

/** 估算块高度（px）。虚拟列表在块还没渲染出来时拿它占位。 */
export function estimateBlockHeight(raw: string): number {
  let h = 0;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) {
      h += 8;
      continue;
    }
    if (/^!\[/.test(t)) {
      h += 220; // 图片
      continue;
    }
    if (/^\|/.test(t)) {
      h += 40; // 表格行
      continue;
    }
    if (/^ {4,}\S/.test(line) || /^(`{3,}|~{3,})/.test(t)) {
      h += 22; // 代码行
      continue;
    }
    if (/^#{1,6}(\s|$)/.test(t)) {
      h += 52; // 标题
      continue;
    }
    // 正文按每行约 42 个全角字符估算
    h += Math.max(1, Math.ceil(t.length / 42)) * 27;
  }
  return Math.max(48, Math.min(h, 8000));
}

/**
 * 把整篇 Markdown 切成若干可独立渲染的块。
 *
 * 切块策略：只在单元边界切；累积到 targetChars 就收一块；标题是天然边界，
 * 累积过半再遇到标题就先收。单个超长单元（比如一个 5000 字的代码块）
 * 自己独占一块，不会被切开。
 */
export function splitMarkdownBlocks(
  markdown: string,
  options: SplitOptions = {}
): MarkdownBlock[] {
  const target = Math.max(MIN_TARGET_CHARS, options.targetChars ?? DEFAULT_TARGET_CHARS);
  if (!markdown.trim()) return [];

  // 统一换行符，后续行号与原文行号保持一致（split 后行数不变）
  const lines = markdown.split(/\r?\n/);
  const units = scanUnits(lines);

  const definitions: string[] = [];
  const blocks: MarkdownBlock[] = [];
  let pending: Unit[] = [];
  let pendingChars = 0;

  const flush = () => {
    if (pending.length === 0) return;
    const startLine = pending[0].start;
    const endLine = pending[pending.length - 1].end;
    const rawSource = lines.slice(startLine, endLine).join("\n");
    blocks.push({
      startLine,
      rawSource,
      source: rawSource,
      estimatedHeight: estimateBlockHeight(rawSource),
    });
    pending = [];
    pendingChars = 0;
  };

  for (const unit of units) {
    if (unit.kind === "definition") {
      definitions.push(lines.slice(unit.start, unit.end).join("\n"));
      continue;
    }
    const unitChars = unit.end - unit.start === 1
      ? lines[unit.start].length
      : lines.slice(unit.start, unit.end).reduce((n, l) => n + l.length + 1, 0);

    // 标题是天然边界：已经攒过半就先收一块，让目录定位更贴
    if (pending.length > 0 && unit.kind === "heading" && pendingChars >= target * 0.5) {
      flush();
    }
    pending.push(unit);
    pendingChars += unitChars;
    if (pendingChars >= target) flush();
  }
  flush();

  if (definitions.length === 0) return blocks;

  // 只给真正引用了定义的块前置定义，避免 N 份重复字符串
  const defs = definitions.join("\n");
  for (const b of blocks) {
    if (/\[\^|\]\[/.test(b.rawSource)) {
      b.source = `${defs}\n\n${b.rawSource}`;
      b.estimatedHeight = estimateBlockHeight(b.source);
    }
  }
  return blocks;
}

/** 二分查找：某一行落在哪个块里（用于目录 / 搜索定位到块） */
export function blockIndexForLine(blocks: MarkdownBlock[], line: number): number {
  if (blocks.length === 0) return -1;
  let lo = 0;
  let hi = blocks.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].startLine <= line) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
