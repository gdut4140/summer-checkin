"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChatCircleText, MagicWand } from "@phosphor-icons/react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { replaceAll } from "@milkdown/kit/utils";
import { undo } from "@milkdown/prose/history";
import {
  Milkdown,
  MilkdownProvider,
  useEditor,
  useInstance,
} from "@milkdown/react";

export interface MilkdownEditorProps {
  /** 初始 Markdown 内容 */
  value: string;
  /** 内容变化回调（全量 Markdown 文本） */
  onChange?: (markdown: string) => void;
  /** 框选文字后点击悬浮按钮：ask = 询问，edit = 让 AI 修改这段 */
  onSelectionAction?: (text: string, intent: "ask" | "edit") => void;
}

/** 通过 ref 暴露给外部的命令式能力 */
export interface EditorPaneHandle {
  /** 滚动到指定标题文字处 */
  scrollToHeading: (text: string) => void;
  /** 用新的 Markdown 整体替换文档内容（进撤销栈，可 Ctrl+Z 回退） */
  replaceContent: (markdown: string) => void;
  /** 撤销一步（撤销栈与 Ctrl+Z 共用） */
  undo: () => void;
}

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

const InnerEditor = forwardRef<EditorPaneHandle, MilkdownEditorProps>(
  function InnerEditor({ value, onChange, onSelectionAction }, ref) {
    // 始终调用最新的回调（避免闭包捕获过期回调）
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    });
    const onSelectionActionRef = useRef(onSelectionAction);
    useEffect(() => {
      onSelectionActionRef.current = onSelectionAction;
    });

    const [, getEditor] = useInstance();

    useImperativeHandle(ref, () => ({
      scrollToHeading(text: string) {
        const editor = getEditor();
        if (!editor) return;
        const root = editor.action((ctx) => ctx.get(rootCtx));
        if (!root || typeof root === "string") return;
        const headings = (root as HTMLElement).querySelectorAll<HTMLElement>(
          "h1, h2, h3, h4, h5, h6"
        );
        for (const heading of headings) {
          if (heading.textContent?.trim() === text.trim()) {
            heading.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
        }
      },
      replaceContent(markdown: string) {
        const editor = getEditor();
        if (!editor) return;
        editor.action(replaceAll(markdown));
      },
      undo() {
        const editor = getEditor();
        if (!editor) return;
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          undo(view.state, view.dispatch);
        });
      },
    }));

    useEditor(
      (root) =>
        Editor.make()
          .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, value);
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              onChangeRef.current?.(markdown);
            });
          })
          .use(commonmark)
          .use(gfm)
          .use(history)
          .use(listener)
          .use(clipboard)
          .use(cursor)
          .use(trailing),
      []
    );

    // ── 选区即问：监听浏览器选区，显示「问 AI / 改这段」悬浮条 ──
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [selection, setSelection] = useState<SelectionState | null>(null);

    useEffect(() => {
      function handleSelectionChange() {
        const domSelection = window.getSelection();
        const wrapper = wrapperRef.current;
        if (!domSelection || domSelection.isCollapsed || !wrapper) {
          setSelection(null);
          return;
        }
        const anchorIn =
          domSelection.anchorNode && wrapper.contains(domSelection.anchorNode);
        const focusIn =
          domSelection.focusNode && wrapper.contains(domSelection.focusNode);
        if (!anchorIn || !focusIn) {
          setSelection(null);
          return;
        }
        const text = domSelection.toString().trim();
        if (!text || text.length > 2000) {
          setSelection(null);
          return;
        }
        const rect = domSelection.getRangeAt(0).getBoundingClientRect();
        setSelection({
          text,
          x: Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110),
          y: Math.max(rect.top, 84),
        });
      }
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
      };
    }, []);

    function handleSelectionAction(intent: "ask" | "edit") {
      if (!selection) return;
      onSelectionActionRef.current?.(selection.text, intent);
      setSelection(null);
    }

    return (
      <div ref={wrapperRef} className="absolute inset-0">
        <Milkdown />

        {selection && (
          <div
            className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-white/12 bg-background/95 p-1 shadow-xl backdrop-blur"
            style={{ left: selection.x, top: selection.y - 46 }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectionAction("ask")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <ChatCircleText className="size-3.5" />
              问 AI
            </button>
            <span className="h-4 w-px bg-white/10" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectionAction("edit")}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <MagicWand className="size-3.5" weight="fill" />
              改这段
            </button>
          </div>
        )}
      </div>
    );
  }
);

export const MilkdownEditor = forwardRef<EditorPaneHandle, MilkdownEditorProps>(
  function MilkdownEditor(props, ref) {
    return (
      <MilkdownProvider>
        <InnerEditor ref={ref} {...props} />
      </MilkdownProvider>
    );
  }
);
