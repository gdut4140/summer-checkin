"use client";

import { useEffect, useRef, useState, type ElementRef } from "react";
import { ArrowsInSimple, ArrowsOutSimple, PaperPlaneTilt, Plus, Quotes, Sparkle, Stop, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/ai/message-bubble";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { ChatMessage } from "@/types";

// ============================================================
// 文档工作室右侧 AI 对话面板（Phase 3）
// · 携带当前文档内容请求 /api/ai（studioContext）
// · AI 可调用文档修改工具（updateDocument / updatePlanInfo）
// · 流结束后通过 onStreamEnd 通知外层拉取最新文档并应用（可撤销）
// ============================================================

const QUICK_PROMPTS = [
  "把这份计划的节奏安排得更合理",
  "帮我把目标拆解成更具体的任务",
  "给这篇文档补充一段学习笔记",
];/**
 * 一段对话归属哪个工作台的哪个对象。
 * 抽成具名类型是为了让 MarkdownStudio 与面板共用同一份定义——
 * 之前两边各写一遍字面量类型，`kind` 从 Record<string,string> 取出来是 string，
 * 不做这层收窄就传不进来（类型检查会拦下）。
 */
export interface AiChatThread {
  surface: "doc" | "plan";
  refId: string;
}

interface AiChatPanelProps {
  /** 当前文档内容（发送消息时随 studioContext 携带） */
  document: string;
  /** 额外上下文（如 { kind, refId }） */
  context?: Record<string, string>;
  /** AI 流结束后触发（外层拉取最新文档应用到编辑器） */
  onStreamEnd?: () => void;
  /** 当前引用的选中文字（显示为引用条，发送时拼入消息） */
  quote?: string | null;
  /** 清除引用 */
  onClearQuote?: () => void;
  /**
   * 这段对话归属哪个工作台的哪个对象（文档 / 计划）。
   *
   * 以前这里是 storageKey，靠浏览器 localStorage 记住「这篇文档对应哪条对话」——
   * 换设备 / 清缓存就断，点「新对话」还会把上一条变成谁也够不着的孤儿。
   * 现在归属关系落在服务端的 conversation.surface + refId 上，面板每次挂载
   * 直接问服务端要，浏览器不留任何状态。
   */
  thread?: AiChatThread;
  /** 对话面板是否处于拉宽状态（顶部按钮切换） */
  aiExpanded?: boolean;
  /** 切换拉宽/收起 */
  onToggleAiExpanded?: () => void;
  /** 外层 studio-root 元素：把对话框挂入其 DOM 树内以继承主题 CSS 变量 */
  studioRoot?: HTMLElement | null;
  /** 新建计划跳转：挂载后聚焦输入框 */
  autoFocus?: boolean;
  /** autoFocus 时预填的引导语（提示用户直接在 AI 框里描述目标） */
  starterPrompt?: string;
}

export function AiChatPanel({
  document,
  context,
  onStreamEnd,
  quote,
  onClearQuote,
  thread,
  aiExpanded = false,
  onToggleAiExpanded,
  studioRoot: studioRootProp,
  starterPrompt,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(starterPrompt ?? "");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  const panelRef = useRef<ElementRef<"aside">>(null);
  const [studioRootFromDom, setStudioRootFromDom] = useState<HTMLElement | null>(null);
  const dialogContainer = studioRootProp ?? studioRootFromDom;

  // 自动向上查找 studio-root 容器（优先用传入的 studioRoot）
  useEffect(() => {
    if (studioRootProp) return;
    const root = panelRef.current?.closest<HTMLElement>(".studio-root") ?? null;
    setStudioRootFromDom(root);
  }, [studioRootProp]);

  const onStreamEndRef = useRef(onStreamEnd);
  useEffect(() => {
    onStreamEndRef.current = onStreamEnd;
  });

  // 挂载时从服务端取回「这篇文档/计划」的对话（取最近一条）。
  // 归属关系存在 conversation.surface + refId 上，浏览器不再保存任何会话状态。
  //
  // threadKey 把 surface + refId 压成一个字符串，既方便做依赖，也方便判断
  // 「这一条载入过没有」——载入中状态由它和 loadedThreadKey 推导，
  // 不在 effect 里同步 setState（那会多一轮级联渲染）。
  const threadSurface = thread?.surface;
  const threadRefId = thread?.refId;
  const threadKey = threadSurface && threadRefId ? `${threadSurface}:${threadRefId}` : null;
  const [loadedThreadKey, setLoadedThreadKey] = useState<string | null>(null);
  const historyLoading = threadKey !== null && loadedThreadKey !== threadKey;

  useEffect(() => {
    if (!threadKey || !threadSurface || !threadRefId) return;
    let cancelled = false;

    const query = `surface=${threadSurface}&refId=${encodeURIComponent(threadRefId)}`;
    fetch(`/api/conversations?${query}`)
      .then((res) => (res.ok ? res.json() : { conversations: [] }))
      .then(async (data: { conversations?: { id: string }[] }) => {
        const latest = data.conversations?.[0];
        if (!latest) return;
        const res = await fetch(`/api/conversations/${latest.id}`);
        if (!res.ok) throw new Error("会话不存在");
        const detail = (await res.json()) as {
          messages?: { id: string; role: "user" | "assistant"; content: string; createdAt: string }[];
        };
        if (cancelled) return;
        conversationIdRef.current = latest.id;
        setMessages(
          (detail.messages ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(m.createdAt),
          }))
        );
      })
      .catch(() => {
        // 取不到就当作新对话，不打断使用
      })
      .finally(() => {
        if (!cancelled) setLoadedThreadKey(threadKey);
      });

    return () => {
      cancelled = true;
    };
  }, [threadKey, threadSurface, threadRefId]);

  // 进入文档工作室即聚焦输入框；「新建计划」引导语在 useState 初始化时预填
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  // 记录用户是否贴底：AI 生成时上滑查看历史不被拉回，只有贴近底部才自动跟随
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const content = input.trim();
    if (!content || loading) return;
    const finalContent = quote ? `关于文档中选中的这段话：\n\n> ${quote}\n\n${content}` : content;
    setInput("");
    if (quote) onClearQuote?.();
    setLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: finalContent,
      createdAt: new Date(),
    };
    const assistantId = `assistant-${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };
    const next = [...messages, userMessage];
    setMessages([...next, placeholder]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: next
            .slice(-8)
            .map(({ role, content: text }) => ({ role, content: text })),
          conversationId: conversationIdRef.current ?? undefined,
          studioContext: context ? { ...context, document } : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "AI 请求失败");
      }
      // 记住会话 id：同一面板内的多轮消息归入同一会话（保存到对话历史）。
      // 归属（哪篇文档/计划）由服务端在建对话时记在 surface + refId 上，这里只留内存值。
      const newConversationId = res.headers.get("X-Conversation-Id");
      if (newConversationId) {
        conversationIdRef.current = newConversationId;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("浏览器不支持流式读取");
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m
          )
        );
      }
      // AI 可能已通过工具修改了文档 → 通知外层拉取最新内容
      onStreamEndRef.current?.();
    } catch (error) {
      setMessages((current) => current.filter((m) => m.id !== assistantId));
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "AI 回复失败");
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  // 新对话：清空当前会话，下次发送时服务端会为这篇文档/计划新建一条
  // （旧对话仍挂在同一 refId 下，不再像以前那样成为够不着的孤儿）
  function newChat() {
    abortRef.current?.abort();
    setLoading(false);
    setMessages([]);
    setInput("");
    conversationIdRef.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // 请求新对话：有记录时先弹出局部确认框
  function requestNewChat() {
    if (messages.length === 0) {
      newChat();
      return;
    }
    setConfirmOpen(true);
  }

  function confirmClear() {
    newChat();
    setConfirmOpen(false);
  }

  return (
    <aside ref={panelRef} className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-white/[0.08]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.08] px-4">
        <Sparkle className="size-4 text-primary" weight="fill" />
        <span className="text-[13px] font-semibold">AI 对话</span>
        <span className="text-[10px] text-muted-foreground">
          {context ? "基于当前文档" : "通用对话"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onToggleAiExpanded && (
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={onToggleAiExpanded}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                />
              }>
                {aiExpanded ? (
                  <ArrowsInSimple className="size-3.5" />
                ) : (
                  <ArrowsOutSimple className="size-3.5" />
                )}
                {aiExpanded ? "收起" : "拉大"}
              </TooltipTrigger>
              <TooltipContent>{aiExpanded ? "收起对话面板" : "拉大对话面板"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={
              <button
                type="button"
                onClick={requestNewChat}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
              />
            }>
              <Plus className="size-3.5" />
              新对话
            </TooltipTrigger>
            <TooltipContent>新对话（清空当前会话）</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-3 py-3">
        {messages.length === 0 && historyLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkle className="size-6" weight="duotone" />
            </div>
            <p className="mt-4 text-[13px] font-medium text-foreground">
              {context ? "让我帮你改这篇文档" : "有什么想问的？"}
            </p>
            <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
              {context
                ? "可以直接说“把目标改得更具体”或“加一个任务”，我会直接修改文档，改完可以 Ctrl+Z 撤销。"
                : "我可以解答学习问题、帮你制定计划。"}
            </p>
            {context && (
              <div className="mt-4 flex w-full flex-col gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.08] p-3">
        {quote && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2">
            <Quotes className="mt-0.5 size-3.5 shrink-0 text-primary" weight="fill" />
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground/80 line-clamp-2">{quote}</p>
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  onClick={onClearQuote}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="清除引用"
                />
              }>
                <X className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>清除引用</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-primary/40">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="让 AI 阅读并修改这篇文档…"
            className="no-scrollbar max-h-[90px] min-h-5 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <Tooltip>
            <TooltipTrigger render={
              <button
                onClick={loading ? stop : () => void send()}
                disabled={!loading && !input.trim()}
                aria-label={loading ? "停止" : "发送"}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              />
            }>
              {loading ? (
                <Stop className="size-4" weight="fill" />
              ) : (
                <PaperPlaneTilt className="size-4" weight="fill" />
              )}
            </TooltipTrigger>
            <TooltipContent>{loading ? "停止" : "发送"}</TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
          框选文字后点「问 AI」可引用到对话
        </p>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent container={dialogContainer} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>开始新对话？</DialogTitle>
            <DialogDescription>当前对话记录会被清空，且无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button onClick={confirmClear}>清空</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
