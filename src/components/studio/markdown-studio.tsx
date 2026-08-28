"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretLeft,
  ChatCircleText,
  Check,
  CheckCircle,
  CaretDown,
  DotsSixVertical,
  DownloadSimple,
  Eye,
  List,
  Moon,
  PencilSimple,
  Sliders,
  Snowflake,
  Sparkle,
  Spinner,
  Sun,
  TreeEvergreen,
  WarningCircle,
  CloudSun,
  Leaf,
  type IconWeight,
} from "@phosphor-icons/react";
import { EditorPane, type EditorPaneHandle, type EditorPaneMode } from "./editor-pane";
import { OutlinePanel } from "./outline-panel";
import { AiChatPanel } from "./ai-chat-panel";
import { extractHeadings } from "@/lib/studio/outline";
import { useStudioTheme, type StudioPreset } from "./use-studio-theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AccordionGallery, { type GalleryItem } from "./accordion-gallery";
import type { BgGalleryItem } from "./bg-accordion-gallery";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "@/styles/onboarding.css";

// ── 文档工作台独立引导（三栏拖拽换位）──────────────────────────────
// 与站外全站引导（OnboardingProvider）完全独立：进入文档工作台自动播放，
// 看过一次不再弹（localStorage 按版本记忆），改版时 bump DOC_TOUR_VERSION 即可重播。
const DOC_TOUR_VERSION = "v2";
const DOC_TOUR_KEY = `summer-checkin.doc-tour.${DOC_TOUR_VERSION}`;

function hasSeenDocTour(): boolean {
  try {
    return window.localStorage.getItem(DOC_TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

function markDocTourSeen(): void {
  try {
    window.localStorage.setItem(DOC_TOUR_KEY, "1");
  } catch {
    // 隐私模式等场景忽略
  }
}

/** 高亮目标不在 DOM 或不可见（如移动端隐藏的面板）→ undefined，退化为居中弹层 */
function resolveTourElement(selector: string): Element | undefined {
  const el = document.querySelector(selector);
  if (!el) return undefined;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return el;
}

/** 把当前文档工作台主题的 CSS 变量提升到 body（driver 弹层挂在 body 下，读不到
 *  .studio-root 作用域内的 --studio-* 变量），引导外观即贴合所选文档主题。 */
function applyDocTourThemeToBody() {
  const root = document.querySelector(".studio-root");
  if (!root) return;
  const cs = getComputedStyle(root);
  const set = (name: string, val: string) => document.body.style.setProperty(name, val);
  set("--tour-doc-bg", cs.getPropertyValue("--studio-base").trim() || "#000000");
  set("--tour-doc-heading", cs.getPropertyValue("--studio-heading").trim() || "#ffffff");
  set("--tour-doc-text", cs.getPropertyValue("--studio-text").trim() || "#e6e6e6");
  set("--tour-doc-muted", cs.getPropertyValue("--studio-text-muted").trim() || "#9aa4b2");
  set("--tour-doc-accent", cs.getPropertyValue("--studio-link").trim() || "#7dd3fc");
  document.body.classList.add("doc-tour-active");
}

function clearDocTourThemeFromBody() {
  document.body.classList.remove("doc-tour-active");
  for (const name of [
    "--tour-doc-bg",
    "--tour-doc-heading",
    "--tour-doc-text",
    "--tour-doc-muted",
    "--tour-doc-accent",
  ]) {
    document.body.style.removeProperty(name);
  }
}

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
  /** 新建计划跳转（?focusAi=1）：进入后自动聚焦 AI 输入框并预填引导语 */
  autoFocusAi?: boolean;
  readOnly?: boolean;
  /** 进入时的默认视图模式；缺省沿用 readOnly ? 专注阅读 : 左右对照 */
  defaultMode?: EditorPaneMode;
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
  autoFocusAi = false,
  readOnly = false,
  defaultMode,
}: MarkdownStudioProps) {
  const aiEnabled = !readOnly && Boolean(ai);
  const router = useRouter();
  const [content, setContent] = useState(document.content);
  const [mode, setMode] = useState<EditorPaneMode>(defaultMode ?? (readOnly ? "focus" : "split"));
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(aiEnabled);
  const [aiExpanded, setAiExpanded] = useState(false);

  /* ── 编辑器预设套餐（7 套餐：3 场景 + 4 纯色，各绑定主题+背景） ── */
  const {
    preset: studioPreset,
    setPreset: setStudioPreset,
    theme: studioTheme,
    opacity: studioOpacity,
    setOpacity: setStudioOpacity,
    rootStyle,
    bgType,
    bgSrc,
    hasBg,
    canAdjustOpacity,
    opacityMin,
    opacityMax,
    opacityLabel,
  } = useStudioTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  /* 移动端 Popover 点击外部自动关闭 */
  useEffect(() => {
    if (!popoverOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      setPopoverOpen(false);
    }
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [popoverOpen]);
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
  const [mobileTab, setMobileTab] = useState<"outline" | "doc" | "ai">(
    autoFocusAi ? "ai" : "doc"
  );
  const [quote, setQuote] = useState<string | null>(null);
  const editorRef = useRef<EditorPaneHandle>(null);
  const docTourRef = useRef<ReturnType<typeof driver> | null>(null);
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

  // ── 文档工作台小指南：介绍工具栏/目录/AI 三栏与拖拽换位 ──
  // 独立于站外全站引导；进入自动播放一次，顶栏「小指南」可随时重看。
  const buildDocTourDriver = useCallback(() => {
    // 动态组装步骤：只读/无 AI 的工作台跳过"AI 助手"步。进度用 driver 模板占位符自动替换。
    const steps: DriveStep[] = [
      {
        popover: {
          title: "文档工作台小指南 ✍️",
          description:
            "这里是你的文档工作台：顶栏管主题与视图，下方分栏承载 目录 / 正文 / AI 助手，三栏位置还能自由调整。几步带你上手。",
          showProgress: true,
          progressText: "{{current}} / {{total}}",
        },
      },
      {
        element: resolveTourElement("[data-tour='studio-toolbar']"),
        popover: {
          title: "工具栏",
          description:
            "返回、标题重命名、主题预设（雨林/雪日/暖云…）与透明度、以及 目录 / AI / 编辑模式 的开关都在这里。",
          side: "bottom",
          align: "start",
          showProgress: true,
          progressText: "{{current}} / {{total}}",
        },
      },
      {
        element: resolveTourElement("[data-tour='studio-outline']"),
        popover: {
          title: "目录栏",
          description:
            "左边是文档目录，点标题可以快速跳到对应章节，长文档导航很方便。",
          side: "right",
          align: "start",
          showProgress: true,
          progressText: "{{current}} / {{total}}",
        },
      },
      {
        element: resolveTourElement("[data-tour='studio-editor']"),
        popover: {
          title: "正文区",
          description:
            "中间这块是文档正文，默认进来是专注阅读；想看对照编辑，点顶栏「编辑模式」切换。",
          side: "top",
          align: "center",
          showProgress: true,
          progressText: "{{current}} / {{total}}",
        },
      },
    ];
    if (aiEnabled) {
      steps.push({
        element: resolveTourElement("[data-tour='studio-ai']"),
        popover: {
          title: "AI 助手",
          description:
            "右边是 AI 面板，选中文字提问、让它帮你改写文档都在这里，改完还能一键撤销。",
          side: "left",
          align: "start",
          showProgress: true,
          progressText: "{{current}} / {{total}}",
        },
      });
    }
    steps.push({
      element: resolveTourElement("[data-tour='studio-panel-grip']"),
      popover: {
        title: "拖拽换位",
        description:
          "每个模块顶部都有这个小把手，按住它左右拖动，就能把 目录 / 正文 / AI 的顺序自由调换。",
        side: "bottom",
        align: "center",
        showProgress: true,
        progressText: "{{current}} / {{total}}",
      },
    });

    // 文档引导外观跟随文档工作台主题（遮罩 / 弹层 / 高亮）
    // 注意：组件 prop 名为 document，会遮蔽全局，必须用 window.document
    applyDocTourThemeToBody();
    const overlayColor =
      getComputedStyle(window.document.body).getPropertyValue("--tour-doc-bg").trim() || "#000000";
    return driver({
      steps,
      animate: true,
      overlayColor,
      overlayOpacity: 0.72,
      smoothScroll: true,
      allowClose: true,
      disableActiveInteraction: true,
      showButtons: ["next", "previous", "close"],
      showProgress: true,
      nextBtnText: "下一步",
      prevBtnText: "上一步",
      doneBtnText: "完成",
      popoverClass: "tour-popover studio-tour-popover",
      // 点"完成"：真正销毁引导（不能依赖 onDestroyStarted，它会拦截销毁导致按钮无反应）
      onDoneClick: () => {
        docTourRef.current?.destroy();
      },
      onDestroyed: () => {
        clearDocTourThemeFromBody();
        markDocTourSeen();
      },
    });
  }, [aiEnabled]);

  // 自动播放：新建计划流程（?focusAi=1）聚焦 AI 输入，不打断；已看过则不重复打扰。
  useEffect(() => {
    if (autoFocusAi || hasSeenDocTour()) return;
    const t = window.setTimeout(() => {
      docTourRef.current = buildDocTourDriver();
      docTourRef.current.drive();
    }, 700);
    return () => {
      window.clearTimeout(t);
      docTourRef.current?.destroy();
    };
  }, [autoFocusAi, buildDocTourDriver]);

  // 手动重看：顶栏「小指南」入口（无论是否已看过都直接播放）
  const startDocTour = useCallback(() => {
    docTourRef.current?.destroy();
    docTourRef.current = buildDocTourDriver();
    docTourRef.current.drive();
  }, [buildDocTourDriver]);

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

  // 返回：有未保存改动 → 直接保存后离开；后台触发一次性退出动作（如重新拆分任务），不阻塞跳转。
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
    <div
      data-preset={studioPreset}
      suppressHydrationWarning
      className={`studio-root studio-theme-${studioTheme} relative flex h-full flex-col`}
      style={rootStyle}
    >
      {/* 背景图层（z-0）：根据当前 preset 的 bgType/bgSrc 只显示对应那一张 */}
      {bgType === "video" && bgSrc ? (
        <video
          className="studio-bg-video"
          src={bgSrc}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
        />
      ) : bgType === "image" ? (
        <div className="studio-bg-layer" aria-hidden />
      ) : null}
      {/* 面板遮罩层（z-1）：统一保证文字可读 */}
      <div className="studio-surface-mask" aria-hidden />
      {/* 顶栏独立保护（z-2）：14 高度的毛玻璃，避免顶栏文字和背景打架 */}
      <div className="studio-header-mask" aria-hidden />

      {/* 顶栏：返回 + 标题 + （桌面=主题胶囊+tab组合）/（移动=tab+Sliders Popover）+ 保存状态 */}
      <header
        data-tour="studio-toolbar"
        className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-foreground/8 px-3 text-foreground sm:px-4"
      >
        <button
          type="button"
          onClick={() => void handleBack()}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-primary-foreground bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-[0_0_0_0_var(--primary-foreground,#051612)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:translate-x-[-2px] hover:shadow-[4px_6px_0_0_var(--primary-foreground,#051612)] active:translate-y-0.5 active:translate-x-[1px] active:shadow-[0_0_0_0_var(--primary-foreground,#051612)]"
        >
          <CaretLeft className="size-4 transition-transform group-hover:-translate-x-0.5" weight="bold" />
          {backLabel}
        </button>
        <div className="h-4 w-px shrink-0 bg-foreground/10" />
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
              className="group flex max-w-full items-center gap-1.5 text-left text-foreground"
            >
              <span className="truncate text-sm font-semibold leading-tight text-foreground">
                {document.title}
              </span>
              {onRename && (
                <PencilSimple className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          )}
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

        {/* 桌面端：顶栏中央胶囊 —— 预设套餐组 + 原有 tab 组合 */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
          <StudioPresetToolGroup
            preset={studioPreset}
            onPreset={setStudioPreset}
            opacity={studioOpacity}
            onOpacity={setStudioOpacity}
            hasBg={hasBg}
            canAdjustOpacity={canAdjustOpacity}
            opacityMin={opacityMin}
            opacityMax={opacityMax}
            opacityLabel={opacityLabel}
          />
          <div className="flex items-center gap-0.5 rounded-full bg-foreground/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => setOutlineOpen((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                outlineOpen ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
              }`}
            >
              <List className="size-3.5" />
              目录
            </button>
            {aiEnabled && (
              <button
                type="button"
                onClick={() => setAiOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                  aiOpen ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
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
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                  mode === "focus" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
                }`}
              >
                <Eye className="size-3.5" />
                {mode === "focus" ? "编辑模式" : "专注阅读"}
              </button>
            )}
          </div>
        </div>

        {/* 移动端：顶栏右侧 Sliders Popover 承载主题工具组 */}
        <div className="relative md:hidden" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <Sliders className="size-4" />
          </button>
          {popoverOpen && (
            <div className="absolute right-0 top-12 z-40 w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl border border-foreground/12 bg-background/90 p-3 shadow-2xl backdrop-blur-lg">
              <StudioPresetToolGroup
                stacked
                preset={studioPreset}
                onPreset={setStudioPreset}
                opacity={studioOpacity}
                onOpacity={setStudioOpacity}
                hasBg={hasBg}
                canAdjustOpacity={canAdjustOpacity}
                opacityMin={opacityMin}
                opacityMax={opacityMax}
                opacityLabel={opacityLabel}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={startDocTour}
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:flex"
        >
          <Sparkle className="size-3.5" />
          小指南
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={exportMarkdown}
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-foreground/10 bg-foreground/[0.04] px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:flex"
          >
            <DownloadSimple className="size-3.5" />
            导出
          </button>
        )}
        {!readOnly && <SaveIndicator state={saveState} />}
      </header>

      {/* 移动端 Tab 切换（桌面端隐藏） */}
      <div className="flex shrink-0 border-b border-foreground/8 md:hidden">
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
                data-tour="studio-outline"
                ref={(el) => {
                  panelElRefs.current["outline"] = el;
                }}
                className={`relative shrink-0 overflow-hidden transition-[width,transform] duration-300 ease-out ${
                  outlineOpen ? "md:w-56 md:translate-x-0" : "md:w-0 md:-translate-x-6"
                } ${mobileTab === "outline" ? "flex w-full" : "hidden"} md:flex relative z-10`}
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
                data-tour="studio-editor"
                ref={(el) => {
                  panelElRefs.current["editor"] = el;
                }}
                className={`relative min-w-0 flex-1 overflow-hidden md:block ${
                  mobileTab === "doc" ? "block" : "hidden"
                } ${aiFlash ? "studio-ai-flash" : ""} relative z-10`}
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
              data-tour="studio-ai"
              ref={(el) => {
                panelElRefs.current["ai"] = el;
              }}
              className={`relative shrink-0 overflow-hidden ${mobileTab === "ai" ? "flex w-full" : "hidden"} md:flex relative z-10`}
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
                  autoFocus={autoFocusAi}
                  starterPrompt={autoFocusAi ? "帮我制定一个学习计划，我的目标是：" : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Studio 预设套餐工具组：圆润下拉框，7 套餐 + 透明度
   stacked: false（桌面）| true（移动 Popover）
   ──────────────────────────────────────────────────────────────────────── */

interface PresetToolGroupProps {
  stacked?: boolean;
  preset: StudioPreset;
  onPreset: (p: StudioPreset) => void;
  opacity: number;
  onOpacity: (n: number) => void;
  hasBg: boolean;
  canAdjustOpacity: boolean;
  opacityMin: number;
  opacityMax: number;
  opacityLabel: string;
}

const PRESET_OPTIONS: {
  value: StudioPreset;
  label: string;
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  group: "scene" | "pure";
}[] = [
  { value: "dark-rain", label: "雨林", icon: TreeEvergreen, group: "scene" },
  { value: "light-snow", label: "雪日", icon: Snowflake, group: "scene" },
  { value: "khaki-cloud", label: "暖云", icon: CloudSun, group: "scene" },
  { value: "dark-pure", label: "暗色", icon: Moon, group: "pure" },
  { value: "light-pure", label: "亮色", icon: Sun, group: "pure" },
  { value: "khaki-pure", label: "卡其", icon: CloudSun, group: "pure" },
  { value: "matcha-pure", label: "抹茶", icon: Leaf, group: "pure" },
];

/** 场景组背景图（AccordionGallery 用） */
const SCENE_GALLERY_ITEMS: GalleryItem[] = [
  { image: "/rain.webp", label: "雨林", value: "dark-rain" },
  { image: "/snow.webp", label: "雪日", value: "light-snow" },
  { image: "/cloud.webp", label: "暖云", value: "khaki-cloud" },
];

function StudioPresetToolGroup({
  stacked = false,
  preset,
  onPreset,
  opacity,
  onOpacity,
  hasBg,
  canAdjustOpacity,
  opacityMin,
  opacityMax,
  opacityLabel,
}: PresetToolGroupProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const currentOption = PRESET_OPTIONS.find((o) => o.value === preset);
  const CurrentIcon = currentOption?.icon ?? CloudSun;

  const sceneOptions = PRESET_OPTIONS.filter((o) => o.group === "scene");
  const pureOptions = PRESET_OPTIONS.filter((o) => o.group === "pure");

  const dropdown = (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[30px] items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-[12px] font-medium leading-none text-foreground transition-all hover:bg-foreground/[0.10]"
      >
        <CurrentIcon className="size-3.5" />
        <span>{currentOption?.label ?? "选择主题"}</span>
        <CaretDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute z-50 w-[400px] rounded-xl border border-foreground/12 bg-background/95 p-2.5 shadow-2xl backdrop-blur-xl ${
            stacked ? "left-0 top-full mt-2" : "left-0 top-full mt-2"
          }`}
        >
          {/* 场景组：手风琴画廊 */}
          <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            场景
          </div>
          <AccordionGallery
            items={SCENE_GALLERY_ITEMS}
            activeIndex={sceneOptions.findIndex((o) => o.value === preset)}
            trigger="hover"
            height={140}
            expandRatio={0.5}
            gap={6}
            radius={10}
            tilt={5}
            onSelect={(_i, item) => {
              onPreset(item.value as StudioPreset);
              setOpen(false);
            }}
          />

          {/* 纯色组 */}
          <div className="mt-2.5 mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            纯色
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {pureOptions.map((o) => {
              const Icon = o.icon;
              const active = preset === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onPreset(o.value);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-foreground/[0.06]"
                  }`}
                >
                  <Icon className="size-3 shrink-0" />
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (stacked) {
    return (
      <div className="flex flex-col gap-3">
        {dropdown}

        {/* 透明度（纯色套餐不显示，固定透明度完全隐藏） */}
        {hasBg && canAdjustOpacity && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              {opacityLabel}
            </div>
            <StudioOpacityRange
              value={opacity}
              onChange={onOpacity}
              min={opacityMin}
              max={opacityMax}
              label={opacityLabel}
            />
          </div>
        )}
      </div>
    );
  }

  // 桌面端：下拉框 + 透明度
  return (
    <div className="flex items-center gap-2">
      {dropdown}

      {/* 透明度（纯色/固定透明度套餐不显示） */}
      {hasBg && canAdjustOpacity && (
        <StudioOpacityRange
          value={opacity}
          onChange={onOpacity}
          min={opacityMin}
          max={opacityMax}
          label={opacityLabel}
        />
      )}
    </div>
  );
}

/**
 * 透明度滑条：通过 style["--val"] 把当前值喂给 CSS 的渐变分段
 * 语义：opacity% = 面板透出背景的比例（100=全透）
 * 视觉上从 0% 到 100% 填充，实际值范围由 min/max 决定
 */
function StudioOpacityRange({
  value,
  onChange,
  min = 0,
  max = 100,
  label = "透明度",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  // 视觉填充：将 [min,max] 映射到 [0%,100%]
  const fillPercent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="studio-opacity-range"
            style={{ ["--val" as any]: `${fillPercent}%` }}
            aria-label={label}
          />
        }
      />
      <TooltipContent side="top" className="text-xs font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PanelGrip({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <div
      data-tour="studio-panel-grip"
      onPointerDown={onPointerDown}
      className="absolute left-1/2 top-1 z-20 flex h-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-md border border-foreground/15 bg-background/90 px-1.5 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground active:cursor-grabbing"
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
      <CheckCircle className="size-3.5 text-muted-foreground" weight="fill" />
      已保存
    </span>
  );
}
