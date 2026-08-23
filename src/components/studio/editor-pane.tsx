"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CaretDown, CaretUp, ChatCircleText, MagnifyingGlass, X } from "@phosphor-icons/react";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { clearHighlights, highlightMatches } from "@/lib/studio/find";

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
}

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    {
      value,
      mode,
      onChange,
      onSelectionAction,
      readOnly = false,
      selectionActionEnabled = true,
    },
    ref
  ) {
    const readRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);
    const scrollSyncingRef = useRef(false);
    const [selection, setSelection] = useState<SelectionState | null>(null);
    const activeSelectionRef = useRef<{ range: Range; text: string } | null>(null);
    const onSelectionActionRef = useRef(onSelectionAction);
    useEffect(() => {
      onSelectionActionRef.current = onSelectionAction;
    });

    // ── 文档内搜索（Ctrl+F）──
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [matchCount, setMatchCount] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const marksRef = useRef<HTMLElement[]>([]);

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

    // 查询变化 / 文档内容变化时重新高亮（内容变化后阅读面板重新渲染，需要重新包裹）
    useEffect(() => {
      if (!searchOpen) {
        clearHighlights(readRef.current);
        return;
      }
      marksRef.current = highlightMatches(readRef.current, query);
      setMatchCount(marksRef.current.length);
      setCurrentIndex(0);
      if (marksRef.current.length > 0) {
        marksRef.current[0].classList.add("is-current");
        marksRef.current[0].scrollIntoView({ block: "center" });
      }
    }, [searchOpen, query, value]);

    useImperativeHandle(ref, () => ({
      scrollToHeading(text: string) {
        const root = readRef.current;
        if (!root) return;
        const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
        for (const h of headings) {
          if (h.textContent?.trim() === text.trim()) {
            h.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
        }
      },
    }));

    // 左右面板同步滚动（按滚动比例，flag 防止互相触发）
    function syncScroll(source: "read" | "edit") {
      if (scrollSyncingRef.current) return;
      scrollSyncingRef.current = true;
      const read = readRef.current;
      const edit = editRef.current;
      if (!read || !edit) {
        scrollSyncingRef.current = false;
        return;
      }
      const maxRead = read.scrollHeight - read.clientHeight;
      const maxEdit = edit.scrollHeight - edit.clientHeight;
      if (source === "read") {
        edit.scrollTop = maxRead > 0 ? (read.scrollTop / maxRead) * maxEdit : 0;
      } else {
        read.scrollTop = maxEdit > 0 ? (edit.scrollTop / maxEdit) * maxRead : 0;
      }
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
      const read = readRef.current;
      read?.addEventListener("scroll", handleReadScroll, { passive: true });
      return () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
        read?.removeEventListener("scroll", handleReadScroll);
      };
    }, [selectionActionEnabled]);

    function handleAction() {
      if (!selection) return;
      if (!selectionActionEnabled) return;
      onSelectionActionRef.current?.(selection.text);
      setSelection(null);
    }

    function scrollToMatch(index: number) {
      marksRef.current.forEach((m) => m.classList.remove("is-current"));
      const el = marksRef.current[index];
      if (!el) return;
      el.classList.add("is-current");
      setCurrentIndex(index);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function goNextMatch() {
      if (marksRef.current.length === 0) return;
      scrollToMatch((currentIndex + 1) % marksRef.current.length);
    }

    function goPrevMatch() {
      if (marksRef.current.length === 0) return;
      scrollToMatch((currentIndex - 1 + marksRef.current.length) % marksRef.current.length);
    }

    function closeSearch() {
      setSearchOpen(false);
      setQuery("");
      setCurrentIndex(0);
      setMatchCount(0);
      marksRef.current = [];
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
        {/* 阅读面板 */}
        <div className="min-w-0 overflow-hidden">
          <div
            ref={readRef}
            onScroll={() => syncScroll("read")}
            className="studio-read studio-scroll h-full overflow-y-auto"
          >
            <div className="mx-auto max-w-3xl px-8 pb-8 pt-8">
              <MarkdownRenderer content={value} />
            </div>
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
                  onScroll={() => syncScroll("edit")}
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
