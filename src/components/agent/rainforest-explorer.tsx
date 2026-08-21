"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  CaretLeft,
  ChatsCircle,
  Files,
  Leaf,
  MagicWand,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/ai/message-bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { KnowledgeBase } from "./knowledge-base";
import type { ChatMessage } from "@/types";
import { useSceneCopy } from "@/context/scene-context";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

type MobilePanel = "history" | "chat" | "knowledge";

// 计划生成直接在对话框里和 AI 说，右侧只保留知识库
const quickPrompts = [
  { label: "拆解本周目标", prompt: "根据我的学习情况，帮我拆解本周最重要的三个目标。" },
  { label: "生成学习计划", prompt: "为我制定一个 7 天学习计划，目标是：" },
  { label: "复盘最近进度", prompt: "结合我最近的打卡和计划，指出进展、风险和下一步。" },
];

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export function RainforestExplorer({ initialPlanner = false }: { initialPlanner?: boolean }) {
  const router = useRouter();
  const { explorerTitle, explorerSubtitle } = useSceneCopy();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 从「新建计划」跳转（/agent?new=1 → initialPlanner）时预填目标提示
  const [input, setInput] = useState(initialPlanner ? "为我制定一个 7 天学习计划，目标是：" : "");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [loading, setLoading] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const initialMsgCountRef = useRef<number>(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 从「新建计划」跳转过来（initialPlanner）→ 聚焦输入框（状态已由 initialPlanner 初始化）
  useEffect(() => {
    if (!initialPlanner) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, [initialPlanner]);

  // 离开旧对话前更新标题
  const updateTitleIfNeeded = useCallback(async () => {
    if (!activeId) return;
    if (messages.length <= initialMsgCountRef.current) return;
    fetch(`/api/conversations/${activeId}/title`, { method: "PATCH" })
      .then((res) => res.json())
      .then((data) => {
        if (data.skipped) return;
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, title: data.title } : c))
        );
      })
      .catch((err) => console.error("[Title] 更新失败:", err));
  }, [activeId, messages.length]);

  const loadConversation = useCallback(async (id: string) => {
    // 离开旧对话前更新标题
    await updateTitleIfNeeded();

    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const data = await response.json();
    setMessages(
      data.messages.map((message: { id: string; role: "user" | "assistant"; content: string; createdAt: string }) => ({
        ...message,
        createdAt: new Date(message.createdAt),
      }))
    );
    setActiveId(id);
    initialMsgCountRef.current = data.messages.length;
    setMobilePanel("chat");
  }, [updateTitleIfNeeded]);

  const refreshConversations = useCallback(async (selectLatest = false) => {
    const response = await fetch("/api/conversations");
    if (!response.ok) return;
    const data = await response.json();
    const list = (data.conversations ?? []) as Conversation[];
    setConversations(list);
    if (selectLatest && list[0]) await loadConversation(list[0].id);
  }, [loadConversation]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refreshConversations(true);
  }, [refreshConversations]);

  function startNewConversation() {
    // 离开旧对话前更新标题
    updateTitleIfNeeded();
    setActiveId(null);
    setMessages([]);
    initialMsgCountRef.current = 0;
    setMobilePanel("chat");
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("删除对话失败");
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeId === id) startNewConversation();
    toast.success("对话已删除");
  }

  function applyPrompt(prompt: string) {
    setInput(prompt);
    setMobilePanel("chat");
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    setLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());

    const userMessage: ChatMessage = { id: `temp-${Date.now()}`, role: "user", content, createdAt: new Date() };
    const assistantId = `assistant-${Date.now()}`;
    const placeholder: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: new Date() };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, placeholder]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages.slice(-40).map(({ role, content: text }) => ({ role, content: text })),
          conversationId: activeId,
          deepThink,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "获取回复失败");
      }
      const newId = response.headers.get("X-Conversation-Id");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("浏览器不支持流式读取");
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: accumulated } : item));
      }
      if (newId) setActiveId(newId);
      await refreshConversations();
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== assistantId));
      if ((error as Error).name !== "AbortError") toast.error(error instanceof Error ? error.message : "AI 回复失败");
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function stopMessage() {
    abortRef.current?.abort();
    setLoading(false);
  }

  return (
    <div className="rainforest-workbench--page w-full text-white">
      <aside className={cn("rainforest-panel rainforest-panel--left", mobilePanel !== "history" && "rainforest-panel--mobile-hidden")}>
            <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkle weight="fill" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{explorerTitle}</p><p className="text-[11px] text-white/46">{explorerSubtitle}</p></div>
            </div>
            <div className="p-3">
              <Button onClick={startNewConversation} className="w-full justify-start bg-white/8 text-white hover:bg-white/14" variant="ghost">
                <Plus weight="bold" /> 新对话
              </Button>
            </div>
            <div className="px-3 pb-2"><p className="px-2 text-[11px] font-medium text-white/38">快速开始</p></div>
            <div className="space-y-1 px-3">
              {quickPrompts.map((item) => (
                <button key={item.label} onClick={() => applyPrompt(item.prompt)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/66 transition hover:bg-white/7 hover:text-white">
                  <MagicWand className="size-4 text-primary" />{item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between px-5 pb-2"><p className="text-[11px] font-medium text-white/38">最近对话</p><span className="text-[10px] text-white/30">{conversations.length}</span></div>
            <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-3 pb-4">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={cn("group flex items-center rounded-md", activeId === conversation.id ? "bg-white/10" : "hover:bg-white/6")}>
                  <button onClick={() => loadConversation(conversation.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                    <p className="truncate text-xs text-white/78">{conversation.title}</p><p className="mt-0.5 text-[10px] text-white/30">{timeAgo(conversation.updatedAt)}</p>
                  </button>
                  <Tooltip>
                    <TooltipTrigger render={
                      <button onClick={() => deleteConversation(conversation.id)} aria-label="删除对话" className="mr-1 hidden size-7 items-center justify-center rounded text-white/36 hover:bg-white/10 hover:text-red-300 group-hover:flex" />
                    }>
                      <Trash />
                    </TooltipTrigger>
                    <TooltipContent>删除对话</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </aside>

          <section className={cn("rainforest-panel rainforest-panel--center", mobilePanel !== "chat" && "rainforest-panel--mobile-hidden")}>
            <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 sm:px-5">
              <div className="flex items-center gap-3">
                <Tooltip>
                  <TooltipTrigger render={
                    <button onClick={() => router.back()} aria-label="返回" className="flex size-8 items-center justify-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" />
                  }>
                    <CaretLeft className="size-5" weight="bold" />
                  </TooltipTrigger>
                  <TooltipContent>返回</TooltipContent>
                </Tooltip>
                <div><p className="text-sm font-semibold">学习对话</p><p className="text-[11px] text-white/40">询问、复盘与深入理解</p></div>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-4 py-5 sm:px-7">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                  <div className="relative flex size-14 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><Sparkle className="size-6" weight="fill" /></div>
                  <h2 className="mt-5 text-xl font-semibold">今天想探索什么？</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/48">我可以和你讨论知识，也可以读取学习节奏并创建可执行的计划草案。</p>
                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
                    {quickPrompts.map((item) => <button key={item.label} onClick={() => applyPrompt(item.prompt)} className="rounded-md border border-white/10 bg-white/4 px-3 py-3 text-xs text-white/66 transition hover:border-primary/35 hover:bg-primary/7 hover:text-white">{item.label}</button>)}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-5">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={bottomRef} /></div>
              )}
            </div>
            <div className="border-t border-white/10 bg-black/10 p-3 sm:p-4">
              <div className="mx-auto max-w-3xl rounded-lg border border-white/12 bg-white/6 p-2 focus-within:border-primary/42">
                <Textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="问一个问题，或说说你卡在哪里…" className="min-h-16 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0" disabled={loading} />
                <div className="flex items-center justify-end gap-1 pt-1">
                  <Tooltip>
                    <TooltipTrigger render={
                      <button onClick={() => setDeepThink((value) => !value)} aria-label="深度思考" className={cn("flex size-8 items-center justify-center rounded-md", deepThink ? "bg-primary/16 text-primary" : "text-white/40 hover:bg-white/8")} />
                    }>
                      <Brain weight={deepThink ? "fill" : "regular"} />
                    </TooltipTrigger>
                    <TooltipContent>深度思考</TooltipContent>
                  </Tooltip>
                  <Button size="icon" onClick={loading ? stopMessage : sendMessage} disabled={!loading && !input.trim()} className="size-8 bg-primary text-primary-foreground hover:bg-primary/90">{loading ? <Stop weight="fill" /> : <PaperPlaneTilt weight="fill" />}</Button>
                </div>
              </div>
            </div>
          </section>

          <aside className={cn("rainforest-panel rainforest-panel--right", mobilePanel !== "knowledge" && "rainforest-panel--mobile-hidden")}>
            {/* ── 右面板：知识库（计划生成直接在对话里和 AI 说） ── */}
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2">
                <Files className="size-4 text-white/60" />
                <span className="text-sm font-semibold">知识库</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar" key="knowledge">
              <div className="rainforest-panel-content">
                <KnowledgeBase />
              </div>
            </div>
          </aside>

          <nav className="rainforest-mobile-nav lg:hidden">
            {([{ key: "history", label: "记录", icon: ChatsCircle }, { key: "chat", label: "探索", icon: Sparkle }, { key: "knowledge", label: "知识库", icon: Files }] as const).map((item) => <button key={item.key} onClick={() => setMobilePanel(item.key)} className={cn(mobilePanel === item.key && "text-primary")}><item.icon weight={mobilePanel === item.key ? "fill" : "regular"} /><span>{item.label}</span></button>)}
          </nav>
    </div>
  );
}
