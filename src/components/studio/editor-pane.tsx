"use client";

import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CaretDown, CaretUp, ChatCircleText, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Virtuoso, type ListRange, type VirtuosoHandle } from "react-virtuoso";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { blockIndexForLine, splitMarkdownBlocks } from "@/lib/studio/markdown-blocks";
import { clearHighlights, countMatches, highlightMatches, stripMarkdownSyntax } from "@/lib/studio/find";
import type { HeadingInfo } from "@/lib/studio/outline";

export interface EditorPaneHandle {
  /** 滚动到指定标题文字处（阅读面板） */
  scrollToHeading: (text: string) => void;
}

export type EditorPaneMode = "split" | "focus";

interface EditorPaneProps {
  value: string;
  mode: EditorPaneMode;
  onChange: (markdown: string) => void;
  onSelectionAction: (text: string) => void;
  readOnly?: boolean;
  selectionActionEnabled?: boolean;
  /** 文档标题目录（用于「目录项 → 块」的定位，以及滚动时反查当前章节） */
  headings?: HeadingInfo[];
  /** 阅读面板滚动时，当前章节在 headings 中的下标（无则 null） */
  onActiveHeadingIndexChange?: (index: number | null) => void;
}

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

/** 阅读面板上下留白：虚拟列表要测量项高，间距不能靠滚动容器 padding */
const READ_PANE_COMPONENTS = {
  Header: () => <div className="h-8" />,
  Footer: () => <div className="h-8" />,
};

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    {
      value,
      mode,
      onChange,
      onSelectionAction,
      readOnly = false,
      selectionActionEnabled = true,
      headings = [],
      onActiveHeadingIndexChange,
    },
    ref
  ) {
    const readRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const scrollSyncingRef = useRef(false);
    const [selection, setSelection] = useState<SelectionState | null>(null);
    const activeSelectionRef = useRef<{ range: Range; text: string } | null>(null);
    const onSelectionActionRef = useRef(onSelectionAction);
    useEffect(() => {
      onSelectionActionRef.current = onSelectionAction;
    });

    /* ── 切块 ──────────────────────────────────────────────────────
     * 整篇 Markdown 交给一个 MarkdownRenderer 时，3000 块的文档要 2.4s、
     * 22501 个 DOM 节点，而且对照模式下每敲一个字符就要重跑一遍。
     * 切成块之后：只渲染视口附近的块，且每个块的 source 独立，
     * MarkdownRenderer 的 memo 能命中——改一个字符只重解析被改的那一块。
     *
     * useDeferredValue 让「打字」保持高优先级：输入框立即更新，切块与预览
     * 渲染退到低优先级，不在按键的关键路径上。
     */
    const deferredValue = useDeferredValue(value);
    const blocks = useMemo(() => splitMarkdownBlocks(deferredValue), [deferredValue]);

    /** 每个标题落在哪一块（目录跳转 / 滚动反查章节都用它） */
    const headingBlockIndex = useMemo(
      () => headings.map((h) => blockIndexForLine(blocks, h.line)),
      [headings, blocks]
    );

    /* ── 文档内搜索（Ctrl+F）──
     * 虚拟化之后没渲染的块在 DOM 里不存在，只查 DOM 会漏结果。
     * 所以：源级统计总数与每块命中数，DOM 级只负责把当前块里的命中画出来。
     */
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const matchIndex = useMemo(() => {
      if (!searchOpen || !query.trim()) return null;
      const perBlock = blocks.map((b) => countMatches(stripMarkdownSyntax(b.rawSource), query));
      const prefix: number[] = [];
      let total = 0;
      for (const n of perBlock) {
        prefix.push(total);
        total += n;
      }
      return { perBlock, prefix, total };
    }, [searchOpen, query, blocks]);
    const matchCount = matchIndex?.total ?? 0;

    // 供 rAF 回调读取最新值（避免把它们写进依赖导致反复重建）
    const searchRef = useRef<{ open: boolean; query: string; current: number }>({
      open: false,
      query: "",
      current: 0,
    });
    useEffect(() => {
      searchRef.current = { open: searchOpen, query, current: currentIndex };
    }, [searchOpen, query, currentIndex]);

    // 把当前命中的 <mark> 标成 is-current（重渲染/补高亮后要重新贴一次）
    const markCurrentRef = useRef<{ blockIndex: number; inBlock: number } | null>(null);
    const applyCurrentMark = useCallback(() => {
      const pos = markCurrentRef.current;
      const root = readRef.current;
      if (!pos || !root) return;
      const host = root.querySelector<HTMLElement>(`[data-block-index="${pos.blockIndex}"]`);
      if (!host) return;
      const marks = Array.from(host.querySelectorAll<HTMLElement>("mark[data-studio-find]"));
      marks.forEach((m) => m.classList.remove("is-current"));
      const target = marks[Math.min(pos.inBlock, marks.length - 1)];
      target?.classList.add("is-current");
    }, []);

    /** 给当前已渲染的块补高亮（搜索中、渲染范围变化时都要补） */
    const highlightRendered = useCallback(() => {
      const { open, query: q } = searchRef.current;
      // 不在搜索状态时直接返回：rangeChanged 在滚动中会连续触发，
      // 没必要为了「清高亮」每次都遍历一遍已渲染的 DOM（关闭搜索时已显式清过）
      if (!open || !q.trim()) return;
      const root = readRef.current;
      if (!root) return;
      root.querySelectorAll<HTMLElement>("[data-block-index]").forEach((node) => {
        highlightMatches(node, q);
      });
      applyCurrentMark();
    }, [applyCurrentMark]);

    const highlightRafRef = useRef<number | null>(null);
    const scheduleHighlight = useCallback(() => {
      if (highlightRafRef.current !== null) return;
      highlightRafRef.current = requestAnimationFrame(() => {
        highlightRafRef.current = null;
        highlightRendered();
      });
    }, [highlightRendered]);

    // Ctrl+F 打开面板内搜索（拦截浏览器原生查找，统一在阅读面板高亮）
    useEffect(() => {
      function handleKeyDown(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setSearchOpen(true);
          requestAnimationFrame(() => searchInputRef.current?.select());
        }
      }
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    /** 跳到第 globalIndex 次命中：先滚到它所在的块，再在该块 DOM 里贴高亮 */
    const scrollToMatch = useCallback(
      (globalIndex: number) => {
        const idx = matchIndex;
        if (!idx || idx.total === 0) return;
        const wrapped = ((globalIndex % idx.total) + idx.total) % idx.total;

        // 二分找出该命中属于哪一块，以及是块内第几次
        let lo = 0;
        let hi = idx.perBlock.length - 1;
        let blockIndex = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (idx.prefix[mid] + idx.perBlock[mid] > wrapped) {
            blockIndex = mid;
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }
        const inBlock = wrapped - idx.prefix[blockIndex];

        setCurrentIndex(wrapped);
        markCurrentRef.current = { blockIndex, inBlock };
        virtuosoRef.current?.scrollToIndex({ index: blockIndex, align: "center" });

        requestAnimationFrame(() => {
          highlightRendered();
          const host = readRef.current?.querySelector<HTMLElement>(
            `[data-block-index="${blockIndex}"]`
          );
          const marks = host
            ? Array.from(host.querySelectorAll<HTMLElement>("mark[data-studio-find]"))
            : [];
          const target = marks[Math.min(inBlock, marks.length - 1)];
          target?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      },
      [matchIndex, highlightRendered]
    );

    // 查询变化 / 打开搜索：重新统计并跳到第一次命中
    useEffect(() => {
      if (!searchOpen) {
        markCurrentRef.current = null;
        clearHighlights(readRef.current);
        return;
      }
      if (!query.trim() || matchCount === 0) {
        markCurrentRef.current = null;
        clearHighlights(readRef.current);
        setCurrentIndex(0);
        return;
      }
      scrollToMatch(0);
      // scrollToMatch 依赖 matchIndex，会在查询变化时重建，这里只需跟着查询走
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchOpen, query, matchCount]);

    /* ── 目录联动 ──────────────────────────────────────────────────
     * 阅读面板滚动时反查「视口顶部所在的块 → 该块之前最后一个标题」，
     * 上报给顶层的目录面板做高亮。这是优化前没有的能力（原来只有点击高亮）。
     */
    const lastReportedHeadingRef = useRef<number | null>(null);
    const headingRafRef = useRef<number | null>(null);
    const rangeRef = useRef<ListRange | null>(null);

    const reportActiveHeading = useCallback(() => {
      headingRafRef.current = null;
      const range = rangeRef.current;
      if (!range || headingBlockIndex.length === 0) return;
      // 最后一个「所在块不晚于视口首块」的标题
      let lo = 0;
      let hi = headingBlockIndex.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (headingBlockIndex[mid] <= range.startIndex) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const next = found >= 0 ? found : null;
      if (next !== lastReportedHeadingRef.current) {
        lastReportedHeadingRef.current = next;
        onActiveHeadingIndexChange?.(next);
      }
    }, [headingBlockIndex, onActiveHeadingIndexChange]);

    const handleRangeChanged = useCallback(
      (range: ListRange) => {
        rangeRef.current = range;
        // 搜索中：新滑进渲染范围的块要补上高亮
        scheduleHighlight();
        if (headingRafRef.current !== null) return;
        headingRafRef.current = requestAnimationFrame(reportActiveHeading);
      },
      [reportActiveHeading, scheduleHighlight]
    );

    useEffect(() => {
      return () => {
        if (highlightRafRef.current !== null) cancelAnimationFrame(highlightRafRef.current);
        if (headingRafRef.current !== null) cancelAnimationFrame(headingRafRef.current);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollToHeading(text: string) {
          const target = text.trim();
          const headingIdx = headings.findIndex((h) => h.text.trim() === target);
          if (headingIdx < 0) return;
          const blockIndex = headingBlockIndex[headingIdx];
          if (blockIndex === undefined || blockIndex < 0) return;
          // 先把所在的块滚进来（虚拟化后它可能还没渲染），再精确对齐到标题本身
          virtuosoRef.current?.scrollToIndex({ index: blockIndex, align: "start" });
          requestAnimationFrame(() => {
            const host = readRef.current?.querySelector<HTMLElement>(
              `[data-block-index="${blockIndex}"]`
            );
            if (!host) return;
            for (const h of host.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
              if (h.textContent?.trim() === target) {
                h.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
            }
          });
        },
      }),
      [headings, headingBlockIndex]
    );

    // 左右面板同步滚动：阅读侧按「首个可见块」定位，比 scrollHeight 比例稳
    // （虚拟化后 scrollHeight 是估算值，会随测量浮动）。
    //
    // 只在**用户真正滚动阅读面板**时触发，不能挂在 rangeChanged 上：
    // 改一个字符、块被重新测量都会让 rangeChanged 触发，那样打字时编辑面板
    // 会被不断拽走。滚动事件才是用户意图的可靠信号。
    const syncFromRead = useCallback(() => {
      if (readOnly || mode !== "split" || scrollSyncingRef.current) return;
      const edit = editRef.current;
      const range = rangeRef.current;
      if (!edit || !range || blocks.length <= 1) return;
      scrollSyncingRef.current = true;
      const ratio = range.startIndex / (blocks.length - 1);
      edit.scrollTop = ratio * Math.max(0, edit.scrollHeight - edit.clientHeight);
      requestAnimationFrame(() => {
        scrollSyncingRef.current = false;
      });
    }, [blocks.length, mode, readOnly]);

    useEffect(() => {
      if (readOnly || mode !== "split") return;
      const read = readRef.current;
      if (!read) return;
      let raf: number | null = null;
      const onScroll = () => {
        if (raf !== null) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          syncFromRead();
        });
      };
      // 滚动不冒泡，但能在捕获阶段拿到内部滚动容器的滚动
      read.addEventListener("scroll", onScroll, { passive: true, capture: true });
      return () => {
        read.removeEventListener("scroll", onScroll, { capture: true });
        if (raf !== null) cancelAnimationFrame(raf);
      };
    }, [mode, readOnly, syncFromRead]);

    function syncFromEdit() {
      if (scrollSyncingRef.current) return;
      const edit = editRef.current;
      if (!edit || blocks.length <= 1) return;
      const maxEdit = edit.scrollHeight - edit.clientHeight;
      const ratio = maxEdit > 0 ? edit.scrollTop / maxEdit : 0;
      const targetBlock = Math.round(ratio * (blocks.length - 1));
      scrollSyncingRef.current = true;
      virtuosoRef.current?.scrollToIndex({ index: targetBlock, align: "start" });
      requestAnimationFrame(() => {
        scrollSyncingRef.current = false;
      });
    }

    // 阅读面板选区 → 弹出「问 AI」；选区滚动时工具条跟随（selectionchange 在滚动时不触发）
    useEffect(() => {
      if (!selectionActionEnabled) {
        setSelection(null);
        return;
      }
      function handleSelectionChange() {
        const sel = window.getSelection();
        const read = readRef.current;
        if (!sel || sel.isCollapsed || !read) {
          activeSelectionRef.current = null;
          setSelection(null);
          return;
        }
        if (!read.contains(sel.anchorNode) && !read.contains(sel.focusNode)) {
          activeSelectionRef.current = null;
          setSelection(null);
          return;
        }
        const text = sel.toString().trim();
        if (!text || text.length > 2000) {
          activeSelectionRef.current = null;
          setSelection(null);
          return;
        }
        const range = sel.getRangeAt(0);
        activeSelectionRef.current = { range, text };
        const rect = range.getBoundingClientRect();
        setSelection({
          text,
          x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
          y: Math.max(rect.top, 88),
        });
      }
      // 阅读面板滚动：重算工具条位置；选区滚出视口则收起，滚回可见时恢复
      function handleReadScroll() {
        const active = activeSelectionRef.current;
        if (!active) return;
        const rect = active.range.getBoundingClientRect();
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          rect.bottom < 0 ||
          rect.top > window.innerHeight
        ) {
          setSelection(null);
          return;
        }
        setSelection({
          text: active.text,
          x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
          y: Math.max(rect.top, 88),
        });
      }
      document.addEventListener("selectionchange", handleSelectionChange);
      // 滚动事件挂在阅读面板外层（Virtuoso 自己管理内部滚动节点）
      const read = readRef.current;
      read?.addEventListener("scroll", handleReadScroll, { passive: true, capture: true });
      return () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
        read?.removeEventListener("scroll", handleReadScroll, { capture: true });
      };
    }, [selectionActionEnabled]);

    function handleAction() {
      if (!selection) return;
      if (!selectionActionEnabled) return;
      onSelectionActionRef.current?.(selection.text);
      setSelection(null);
    }

    function goNextMatch() {
      if (matchCount === 0) return;
      scrollToMatch(currentIndex + 1);
    }

    function goPrevMatch() {
      if (matchCount === 0) return;
      scrollToMatch(currentIndex - 1);
    }

    function closeSearch() {
      setSearchOpen(false);
      setQuery("");
      setCurrentIndex(0);
      markCurrentRef.current = null;
      clearHighlights(readRef.current);
    }

    function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) goPrevMatch();
        else goNextMatch();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    }

    return (
      <div
        className="absolute inset-0 grid transition-[grid-template-columns] duration-300 ease-in-out"
        style={{
          gridTemplateColumns:
            !readOnly && mode === "split"
              ? "minmax(0,1fr) minmax(0,1fr)"
              : "minmax(0,1fr) 0fr",
        }}
      >
        {/* 阅读面板（虚拟化：只渲染视口附近的块） */}
        <div className="min-w-0 overflow-hidden">
          <div ref={readRef} className="studio-read h-full">
            <Virtuoso
              ref={virtuosoRef}
              className="studio-scroll"
              style={{ height: "100%" }}
              data={blocks}
              components={READ_PANE_COMPONENTS}
              defaultItemHeight={600}
              // 上下都多留一屏左右的缓冲，快速滚动不容易白屏
              increaseViewportBy={{ top: 900, bottom: 900 }}
              rangeChanged={handleRangeChanged}
              itemContent={(index, block) => (
                // data-block-index 是搜索与目录定位的锚点
                <div className="mx-auto max-w-3xl px-8" data-block-index={index}>
                  <MarkdownRenderer content={block.source} />
                </div>
              )}
            />
          </div>
        </div>

        {/* 编辑面板 */}
        <div className="min-w-0 overflow-hidden">
          {!readOnly && (
            <div className="h-full border-l border-white/8">
              <div className="mx-auto h-full max-w-3xl px-8 py-8">
                <textarea
                  ref={editRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onScroll={syncFromEdit}
                  spellCheck={false}
                  className="studio-edit-textarea studio-scroll h-full w-full resize-none bg-transparent font-mono text-sm leading-7 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 文档内搜索栏（Ctrl+F） */}
        {searchOpen && (
          <div className="absolute right-4 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/12 bg-background/95 p-1.5 pl-2.5 shadow-xl backdrop-blur">
            <MagnifyingGlass className="size-3.5 shrink-0 text-muted-foreground/70" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索文档"
              className="w-44 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
              {query ? (matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : "0/0") : ""}
            </span>
            <button
              type="button"
              onClick={goPrevMatch}
              title="上一个 (Shift+Enter)"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
            >
              <CaretUp className="size-3" weight="bold" />
            </button>
            <button
              type="button"
              onClick={goNextMatch}
              title="下一个 (Enter)"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
            >
              <CaretDown className="size-3" weight="bold" />
            </button>
            <button
              type="button"
              onClick={closeSearch}
              title="关闭 (Esc)"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {/* 选区浮动工具条 */}
        {selectionActionEnabled && selection && (
          <div
            className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-foreground/12 bg-background/95 p-1 shadow-xl backdrop-blur"
            style={{ left: selection.x, top: selection.y - 46 }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAction}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/10"
            >
              <ChatCircleText className="size-3.5" />
              问 AI
            </button>
          </div>
        )}
      </div>
    );
  }
);
