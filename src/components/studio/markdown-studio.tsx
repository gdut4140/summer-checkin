"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretLeft,
  ChatCircleText,
  CheckCircle,
  Columns,
  DotsSixVertical,
  DownloadSimple,
  Eye,
  List,
  PencilSimple,
  Spinner,
  WarningCircle,
} from "@phosphor-icons/react";
import { EditorPane, type EditorPaneHandle, type EditorPaneMode } from "./editor-pane";
import { OutlinePanel } from "./outline-panel";
import { AiChatPanel } from "./ai-chat-panel";
import { extractHeadings } from "@/lib/studio/outline";

export interface MarkdownStudioDocument {
  id: string;
  title: string;
  content: string;
}

export interface MarkdownStudioProps {
  document: MarkdownStudioDocument;
  onSave: (content: string) => Promise<void>;
  backHref: string;
  backLabel?: string;
  backNavigation?: "push" | "replace";
  onRename?: (title: string) => Promise<void>;
  /** 文档有改动时，返回前在后台触发的一次性动作（如重新拆分任务），不阻塞跳转。 */
  onExit?: () => Promise<void>;
  ai?: {
    context?: Record<string, string>;
    fetchLatest?: () => Promise<string>;
  };
  readOnly?: boolean;
}

type SaveState = "saved" | "dirty" | "saving" | "error";
type PanelKey = "outline" | "editor" | "ai";

const SAVE_DEBOUNCE_MS = 1200;
const AI_PANEL_WIDTH = 380;
const AI_PANEL_EXPANDED_WIDTH = 640;

export function MarkdownStudio({
  document,
  onSave,
  backHref,
  backLabel = "返回",
  backNavigation = "push",
  onRename,
  onExit,
  ai,
  readOnly = false,
}: MarkdownStudioProps) {
  const aiEnabled = !readOnly && Boolean(ai);
  const router = useRouter();
  const [content, setContent] = useState(document.content);
  const [mode, setMode] = useState<EditorPaneMode>(readOnly ? "focus" : "split");
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(aiEnabled);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [panelOrder, setPanelOrder] = useState<PanelKey[]>(
    aiEnabled ? ["outline", "editor", "ai"] : ["outline", "editor"]
  );
  const [draggingKey, setDraggingKey] = useState<PanelKey | null>(null);
  const panelOrderRef = useRef(panelOrder);
  const panelElRefs = useRef<Partial<Record<PanelKey, HTMLElement | null>>>({});
  const firstRectsRef = useRef<Partial<Record<PanelKey, DOMRect | null>>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const [showAiUndo, setShowAiUndo] = useState(false);
  const [aiFlash, setAiFlash] = useState(false);
  const [mobileTab, setMobileTab] = useState<"outline" | "doc" | "ai">("doc");
  const [quote, setQuote] = useState<string | null>(null);
  const editorRef = useRef<EditorPaneHandle>(null);
  const flashTimerRef = useRef<number | null>(null);
  const aiUndoContentRef = useRef<string | null>(null);

  const contentRef = useRef(document.content);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    if (!aiEnabled) {
      setAiOpen(false);
      setAiExpanded(false);
      setPanelOrder((prev) => prev.filter((k) => k !== "ai"));
      if (mobileTab === "ai") setMobileTab("doc");
    }
  }, [aiEnabled, mobileTab]);

  const doSave = useCallback(async () => {
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      await onSaveRef.current(contentRef.current);
      setSaveState(dirtyRef.current ? "dirty" : "saved");
    } catch {
      dirtyRef.current = true;
      setSaveState("error");
    }
  }, []);

  const handleChange = useCallback(
    (markdown: string) => {
      contentRef.current = markdown;
      dirtyRef.current = true;
      setContent(markdown);
      setSaveState("dirty");
      setShowAiUndo(false);
      aiUndoContentRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void doSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [doSave]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      if (dirtyRef.current) {
        void onSaveRef.current(contentRef.current).catch(() => {});
      }
    };
  }, []);

  const headings = useMemo(() => extractHeadings(content), [content]);

  const handleNavigate = useCallback((heading: { text: string }) => {
    editorRef.current?.scrollToHeading(heading.text);
    setMobileTab("doc");
  }, []);

  // 框选文字 → 作为引用交给 AI（引用条展示，不塞输入框），并自动打开 AI 侧边栏
  const handleSelectionAction = useCallback((text: string) => {
    if (!aiEnabled) return;
    setQuote(text.length > 600 ? `${text.slice(0, 600)}…` : text);
    setAiOpen(true);
    setMobileTab("ai");
  }, [aiEnabled]);

  // AI 流结束后：拉取最新文档 → 更新内容 → 标记已保存（可撤销）
  const handleAiStreamEnd = useCallback(async () => {
    if (!aiEnabled) return;
    if (!ai?.fetchLatest) return;
    try {
      const latest = await ai.fetchLatest();
      if (typeof latest !== "string" || latest.length === 0) return;
      aiUndoContentRef.current = contentRef.current;
      contentRef.current = latest;
      setContent(latest);
      dirtyRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setSaveState("saved");
      setShowAiUndo(true);
      setAiFlash(true);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setAiFlash(false), 1800);
    } catch {
      // 拉取失败不阻塞对话
    }
  }, [ai, aiEnabled]);

  const handleAiUndo = useCallback(() => {
    if (aiUndoContentRef.current === null) return;
    contentRef.current = aiUndoContentRef.current;
    setContent(aiUndoContentRef.current);
    aiUndoContentRef.current = null;
    dirtyRef.current = true;
    setSaveState("dirty");
    setShowAiUndo(false);
  }, []);

  // 返回：保存未落盘的改动后，后台触发一次性退出动作（如重新拆分任务），不阻塞跳转。
  // 注意不能用 dirtyRef 判断：AI 改文档时服务端已落库、dirtyRef 为 false，但文档确实变了。
  const handleBack = useCallback(async () => {
    const changed = contentRef.current !== document.content;
    if (changed && dirtyRef.current) await doSave();
    if (changed && onExit) {
      // 后台拆分，不阻塞返回；拆分中抽屉会显示"任务刷新中"
      void onExit().catch(() => {});
    }
    if (backNavigation === "replace") {
      router.replace(backHref);
      return;
    }
    router.push(backHref);
  }, [doSave, onExit, backHref, backNavigation, router, document.content]);

  // 导出当前文档为 .md 文件（始终用最新内容，含未保存改动）
  // 注意：组件 prop 名为 document，会遮蔽全局 document，这里必须用 window.document
  function exportMarkdown() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    const base = document.title.trim() || "未命名文档";
    link.download = `${base.replace(/[\\/:*?"<>|]/g, "_")}.md`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // 三栏拖拽排序（pointer 事件，丝滑无卡顿）
  function startPanelDrag(e: ReactPointerEvent, key: PanelKey) {
    e.preventDefault();
    setDraggingKey(key);
    let lastX = e.clientX;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX;
      if (Math.abs(dx) < 90) return;
      lastX = ev.clientX;
      const idx = panelOrderRef.current.indexOf(key);
      const targetIdx = dx > 0 ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= panelOrderRef.current.length) return;
      // 记录交换前位置（FLIP first）
      for (const k of panelOrderRef.current) {
        firstRectsRef.current[k] = panelElRefs.current[k]?.getBoundingClientRect() ?? null;
      }
      const next = [...panelOrderRef.current];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      panelOrderRef.current = next;
      setPanelOrder(next);
    };
    const onUp = () => {
      setDraggingKey(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // 面板重排后 FLIP 过渡：从旧位置平滑滑到新位置
  useLayoutEffect(() => {
    for (const k of panelOrder) {
      const el = panelElRefs.current[k];
      const first = firstRectsRef.current[k];
      if (!el || !first) continue;
      const dx = first.left - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) continue;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
    }
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const k of panelOrder) {
          const el = panelElRefs.current[k];
          if (!el) continue;
          el.style.transition = "transform 300ms ease-out";
          el.style.transform = "";
        }
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [panelOrder]);

  const startRename = useCallback(() => {
    if (readOnly || !onRename) return;
    setRenameValue(document.title);
    setRenaming(true);
  }, [document.title, onRename, readOnly]);

  const commitRename = useCallback(async () => {
    const next = renameValue.trim();
    if (!next || next === document.title) {
      setRenaming(false);
      return;
    }
    try {
      await onRename?.(next);
      setRenaming(false);
    } catch {
      // 重命名失败保持编辑状态，由父层提示
    }
  }, [renameValue, document.title, onRename]);

  // Ctrl/Cmd+S 立即保存
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void doSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doSave]);

  return (
    <div className="flex h-full flex-col bg-[#0a1a15] text-foreground">
      {/* 顶栏：返回 + 标题 + 目录/专注阅读/左右对照 + 保存状态 */}
      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-3 sm:px-4">
        <button
          type="button"
          onClick={() => void handleBack()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          <CaretLeft className="size-3.5" weight="bold" />
          {backLabel}
        </button>
        <div className="h-4 w-px shrink-0 bg-white/10" />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={() => void commitRename()}
              className="w-full max-w-md border-b-2 border-primary bg-transparent pb-0.5 text-sm font-semibold leading-tight text-foreground outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              disabled={!onRename}
              title={onRename ? "点击重命名" : undefined}
              className="group flex max-w-full items-center gap-1.5 text-left"
            >
              <span className="truncate text-sm font-semibold leading-tight">
                {document.title}
              </span>
              {onRename && (
                <PencilSimple className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          )}
          <p className="truncate text-[10px] text-muted-foreground">
            {readOnly
              ? "只读模式 · 目录与阅读"
              : "Markdown 文档 · 左右对照或专注阅读 · 框选文字可让 AI 改这段 · Ctrl+S 保存"}
          </p>
        </div>
        {!readOnly && showAiUndo && (
          <button
            type="button"
            onClick={handleAiUndo}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <ArrowCounterClockwise className="size-3.5" weight="fill" />
            AI 已更新 · 撤销
          </button>
        )}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-primary/40 bg-white/4 p-0.5">
          <button
            type="button"
            onClick={() => setOutlineOpen((v) => !v)}
            title="目录"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              outlineOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="size-3.5" />
            目录
          </button>
          {aiEnabled && (
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              title="AI 对话"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                aiOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ChatCircleText className="size-3.5" />
              AI
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setMode(mode === "split" ? "focus" : "split")}
              title={mode === "split" ? "专注阅读" : "左右对照"}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                mode === "focus" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "split" ? (
                <>
                  <Eye className="size-3.5" />
                  专注阅读
                </>
              ) : (
                <>
                  <Columns className="size-3.5" />
                  左右对照
                </>
              )}
            </button>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={exportMarkdown}
            title="导出为 Markdown 文件"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
          >
            <DownloadSimple className="size-3.5" />
            导出
          </button>
        )}
        {!readOnly && <SaveIndicator state={saveState} />}
      </header>

      {/* 移动端 Tab 切换（桌面端隐藏） */}
      <div className="flex shrink-0 border-b border-white/8 md:hidden">
        {(
          aiEnabled
            ? [
                { key: "outline", label: "目录" },
                { key: "doc", label: "文档" },
                { key: "ai", label: "AI" },
              ]
            : [
                { key: "outline", label: "目录" },
                { key: "doc", label: "文档" },
              ]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMobileTab(tab.key as "outline" | "doc" | "ai")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mobileTab === tab.key
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 三栏主体（可拖拽排序；移动端按 Tab 切换显示） */}
      <div className="flex min-h-0 flex-1">
        {panelOrder.map((key) => {
          if (key === "outline") {
            return (
              <div
                key={key}
                ref={(el) => {
                  panelElRefs.current["outline"] = el;
                }}
                className={`relative shrink-0 overflow-hidden transition-[width,transform] duration-300 ease-out ${
                  outlineOpen ? "md:w-56 md:translate-x-0" : "md:w-0 md:-translate-x-6"
                } ${mobileTab === "outline" ? "flex w-full" : "hidden"} md:flex`}
              >
                <PanelGrip onPointerDown={(e) => startPanelDrag(e, "outline")} />
                <div className="flex h-full w-full md:w-56">
                  <OutlinePanel headings={headings} onNavigate={handleNavigate} />
                </div>
              </div>
            );
          }
          if (key === "editor") {
            return (
              <main
                key={key}
                ref={(el) => {
                  panelElRefs.current["editor"] = el;
                }}
                className={`relative min-w-0 flex-1 overflow-hidden md:block ${
                  mobileTab === "doc" ? "block" : "hidden"
                } ${aiFlash ? "studio-ai-flash" : ""}`}
              >
                <PanelGrip onPointerDown={(e) => startPanelDrag(e, "editor")} />
                <EditorPane
                  ref={editorRef}
                  value={content}
                  mode={mode}
                  onChange={handleChange}
                  onSelectionAction={handleSelectionAction}
                  readOnly={readOnly}
                  selectionActionEnabled={aiEnabled}
                />
              </main>
            );
          }
          return (
            <div
              key={key}
              ref={(el) => {
                panelElRefs.current["ai"] = el;
              }}
              className={`relative shrink-0 overflow-hidden ${mobileTab === "ai" ? "flex w-full" : "hidden"} md:flex`}
              style={{
                width: aiOpen ? (aiExpanded ? AI_PANEL_EXPANDED_WIDTH : AI_PANEL_WIDTH) : 0,
                transform: aiOpen ? "translateX(0)" : "translateX(16px)",
                transition: "width 300ms ease-out, transform 300ms ease-out",
              }}
            >
              <PanelGrip onPointerDown={(e) => startPanelDrag(e, "ai")} />
              <div className="flex h-full w-full">
                <AiChatPanel
                  document={content}
                  context={ai?.context}
                  onStreamEnd={handleAiStreamEnd}
                  quote={quote}
                  onClearQuote={() => setQuote(null)}
                  storageKey={ai?.context ? `${ai.context.kind ?? "doc"}:${ai.context.refId ?? ""}` : undefined}
                  aiExpanded={aiExpanded}
                  onToggleAiExpanded={() => setAiExpanded((v) => !v)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelGrip({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute left-1/2 top-1 z-20 flex h-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-md border border-white/15 bg-[#0d2a21]/90 px-1.5 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground active:cursor-grabbing"
      title="拖动排序"
    >
      <DotsSixVertical className="size-4" />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Spinner className="size-3.5 animate-spin" />
        保存中…
      </span>
    );
  }
  if (state === "dirty") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-amber-300/90">
        <span className="size-1.5 rounded-full bg-amber-300/90" />
        未保存
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-amber-400">
        <WarningCircle className="size-3.5" weight="fill" />
        保存失败
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <CheckCircle className="size-3.5 text-emerald-400/80" weight="fill" />
      已保存
    </span>
  );
}
