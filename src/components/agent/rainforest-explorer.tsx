"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  Brain,
  ChatsCircle,
  ClockCounterClockwise,
  Files,
  Leaf,
  ListChecks,
  MagicWand,
  PaperPlaneTilt,
  Plus,
  Robot,
  Sparkle,
  Stop,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/ai/message-bubble";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KnowledgeBase } from "./knowledge-base";
import { CoachOverview } from "./coach-overview";
import { NotificationCenter } from "./notification-center";
import { AgentWorkspace, type AgentRunListItem } from "./agent-workspace";
import type { ChatMessage } from "@/types";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

type MobilePanel = "history" | "chat" | "agent" | "knowledge";
type WorkMode = "chat" | "planner";
type RightPanel = "agent" | "knowledge";
type AgentSubTab = "coach" | "workspace" | "notifications";

const quickPrompts = [
  { label: "拆解本周目标", prompt: "根据我的学习情况，帮我拆解本周最重要的三个目标。", mode: "chat" as const },
  { label: "生成学习计划", prompt: "为我制定一个 7 天学习计划，目标是：", mode: "planner" as const },
  { label: "复盘最近进度", prompt: "结合我最近的打卡和计划，指出进展、风险和下一步。", mode: "chat" as const },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export function RainforestExplorer() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRunListItem[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<WorkMode>("chat");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [loading, setLoading] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("agent");
  const [agentSubTab, setAgentSubTab] = useState<AgentSubTab>("coach");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, moved: false, dx: 0, dy: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const initialMsgCountRef = useRef<number>(0);

  useEffect(() => {
    const saved = localStorage.getItem("rainforest-orb-position");
    let parsed: { x: number; y: number } | null = null;
    try {
      parsed = saved ? (JSON.parse(saved) as { x: number; y: number }) : null;
    } catch {
      localStorage.removeItem("rainforest-orb-position");
    }
    const frame = requestAnimationFrame(() => {
      setPosition({
        x: parsed?.x ?? window.innerWidth - 92,
        y: parsed?.y ?? Math.round(window.innerHeight * 0.62),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function keepOrbInViewport() {
      setPosition((current) => {
        const next = {
          x: current.x + 32 < window.innerWidth / 2 ? 12 : window.innerWidth - 76,
          y: clamp(current.y, 76, window.innerHeight - 76),
        };
        localStorage.setItem("rainforest-orb-position", JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", keepOrbInViewport);
    return () => window.removeEventListener("resize", keepOrbInViewport);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadRuns = useCallback(async () => {
    const response = await fetch("/api/agent/runs");
    if (!response.ok) return;
    const data = await response.json();
    setRuns(data.runs ?? []);
  }, []);

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
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    void Promise.all([refreshConversations(true), loadRuns()]);
  }, [open, loadRuns, refreshConversations]);

  function startNewConversation() {
    // 离开旧对话前更新标题
    updateTitleIfNeeded();
    setActiveId(null);
    setMessages([]);
    initialMsgCountRef.current = 0;
    setMode("chat");
    setMobilePanel("chat");
  }

  async function deleteConversation(id: string) {
    const response = await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("删除对话失败");
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeId === id) startNewConversation();
    toast.success("对话已删除");
  }

  function applyPrompt(prompt: string, nextMode: WorkMode) {
    setInput(prompt);
    setMode(nextMode);
    setMobilePanel("chat");
  }

  async function runPlanner(goal: string) {
    const response = await fetch("/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, mode: "planner" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "生成计划失败");
    await loadRuns();
    setRightPanel("agent");
    setAgentSubTab("workspace");
    setMobilePanel("agent");
    toast.success("计划草案已生成，请在右侧确认");
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    setLoading(true);

    if (mode === "planner") {
      try {
        await runPlanner(content);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "生成计划失败");
      } finally {
        setLoading(false);
      }
      return;
    }

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

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      dragging: true,
      moved: false,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.dragging) return;
    const nextX = clamp(event.clientX - dragRef.current.dx, 12, window.innerWidth - 76);
    const nextY = clamp(event.clientY - dragRef.current.dy, 76, window.innerHeight - 76);
    if (Math.abs(nextX - position.x) > 3 || Math.abs(nextY - position.y) > 3) dragRef.current.moved = true;
    setPosition({ x: nextX, y: nextY });
  }

  function onPointerUp() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (!dragRef.current.moved) {
      setOpen(true);
      return;
    }
    const snapped = {
      x: position.x + 32 < window.innerWidth / 2 ? 12 : window.innerWidth - 76,
      y: clamp(position.y, 76, window.innerHeight - 76),
    };
    setPosition(snapped);
    localStorage.setItem("rainforest-orb-position", JSON.stringify(snapped));
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="打开探索雨林"
              className="rainforest-orb fixed z-40 touch-none select-none"
              style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          }
        >
          <span className="rainforest-orb__halo" />
          <span className="rainforest-orb__core"><Leaf weight="fill" /></span>
          <span className="rainforest-orb__spark rainforest-orb__spark--one" />
          <span className="rainforest-orb__spark rainforest-orb__spark--two" />
        </TooltipTrigger>
        <TooltipContent side="left">探索雨林</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="rainforest-workbench h-[min(780px,calc(100dvh-32px))] w-[min(1440px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-lg border-white/18 bg-[#071510]/28 p-0 text-white shadow-2xl backdrop-blur-xl ring-0 sm:max-w-none">
          <DialogTitle className="sr-only">探索雨林智能体工作台</DialogTitle>
          <DialogDescription className="sr-only">对话、计划与智能体行动整合工作台</DialogDescription>

          <aside className={cn("rainforest-panel rainforest-panel--left", mobilePanel !== "history" && "rainforest-panel--mobile-hidden")}>
            <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
              <div className="flex size-9 items-center justify-center rounded-md bg-[#d7ef83] text-[#10271e]"><Leaf weight="fill" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">探索雨林</p><p className="text-[11px] text-white/46">你的学习智能体</p></div>
              <button onClick={() => setOpen(false)} aria-label="关闭" className="flex size-8 items-center justify-center rounded-md text-white/50 hover:bg-white/8 hover:text-white lg:hidden"><X /></button>
            </div>
            <div className="p-3">
              <Button onClick={startNewConversation} className="w-full justify-start bg-white/8 text-white hover:bg-white/14" variant="ghost">
                <Plus weight="bold" /> 新对话
              </Button>
            </div>
            <div className="px-3 pb-2"><p className="px-2 text-[11px] font-medium text-white/38">快速开始</p></div>
            <div className="space-y-1 px-3">
              {quickPrompts.map((item) => (
                <button key={item.label} onClick={() => applyPrompt(item.prompt, item.mode)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-white/66 transition hover:bg-white/7 hover:text-white">
                  <MagicWand className="size-4 text-[#d7ef83]" />{item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between px-5 pb-2"><p className="text-[11px] font-medium text-white/38">最近对话</p><span className="text-[10px] text-white/30">{conversations.length}</span></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={cn("group flex items-center rounded-md", activeId === conversation.id ? "bg-white/10" : "hover:bg-white/6")}>
                  <button onClick={() => loadConversation(conversation.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                    <p className="truncate text-xs text-white/78">{conversation.title}</p><p className="mt-0.5 text-[10px] text-white/30">{timeAgo(conversation.updatedAt)}</p>
                  </button>
                  <button onClick={() => deleteConversation(conversation.id)} aria-label="删除对话" className="mr-1 hidden size-7 items-center justify-center rounded text-white/36 hover:bg-white/10 hover:text-red-300 group-hover:flex"><Trash /></button>
                </div>
              ))}
            </div>
          </aside>

          <section className={cn("rainforest-panel rainforest-panel--center", mobilePanel !== "chat" && "rainforest-panel--mobile-hidden")}>
            <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div><p className="text-sm font-semibold">{mode === "chat" ? "学习对话" : "计划构建"}</p><p className="text-[11px] text-white/40">{mode === "chat" ? "询问、复盘与深入理解" : "生成草案，确认后写入计划"}</p></div>
              </div>
              <Button variant="ghost" size="icon" className="text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label="关闭"><X /></Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                  <div className="relative flex size-14 items-center justify-center rounded-lg border border-[#d7ef83]/30 bg-[#d7ef83]/10 text-[#d7ef83]"><Sparkle className="size-6" weight="fill" /></div>
                  <h2 className="mt-5 text-xl font-semibold">今天想探索什么？</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/48">我可以和你讨论知识，也可以读取学习节奏并创建可执行的计划草案。</p>
                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
                    {quickPrompts.map((item) => <button key={item.label} onClick={() => applyPrompt(item.prompt, item.mode)} className="rounded-md border border-white/10 bg-white/4 px-3 py-3 text-xs text-white/66 transition hover:border-[#d7ef83]/35 hover:bg-[#d7ef83]/7 hover:text-white">{item.label}</button>)}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-5">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={bottomRef} /></div>
              )}
            </div>
            <div className="border-t border-white/10 bg-black/10 p-3 sm:p-4">
              <div className="mx-auto max-w-3xl rounded-lg border border-white/12 bg-white/6 p-2 focus-within:border-[#d7ef83]/42">
                <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={mode === "chat" ? "问一个问题，或说说你卡在哪里…" : "描述目标、周期和每天可投入时间…"} className="min-h-16 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0" disabled={loading} />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex rounded-md bg-black/20 p-0.5">
                    <button onClick={() => setMode("chat")} className={cn("flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px]", mode === "chat" ? "bg-white/12 text-white" : "text-white/42")}><ChatsCircle />对话</button>
                    <button onClick={() => setMode("planner")} className={cn("flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px]", mode === "planner" ? "bg-white/12 text-white" : "text-white/42")}><ListChecks />执行计划</button>
                  </div>
                  <div className="flex items-center gap-1">
                    {mode === "chat" && <button onClick={() => setDeepThink((value) => !value)} aria-label="深度思考" className={cn("flex size-8 items-center justify-center rounded-md", deepThink ? "bg-[#d7ef83]/16 text-[#d7ef83]" : "text-white/40 hover:bg-white/8")}><Brain weight={deepThink ? "fill" : "regular"} /></button>}
                    <Button size="icon" onClick={loading ? stopMessage : sendMessage} disabled={!loading && !input.trim()} className="size-8 bg-[#d7ef83] text-[#10271e] hover:bg-[#e5f6a6]">{loading ? <Stop weight="fill" /> : <PaperPlaneTilt weight="fill" />}</Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className={cn("rainforest-panel rainforest-panel--right", mobilePanel !== "agent" && mobilePanel !== "knowledge" && "rainforest-panel--mobile-hidden")}>
            {/* ── 右面板 header：下拉切换 ── */}
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-1 rounded-md bg-white/5 p-0.5">
                <button
                  onClick={() => { setRightPanel("agent"); setMobilePanel("agent"); }}
                  className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] transition", rightPanel === "agent" ? "bg-white/12 text-white" : "text-white/40")}
                ><Robot className="size-3.5" />Agent</button>
                <button
                  onClick={() => { setRightPanel("knowledge"); setMobilePanel("knowledge"); }}
                  className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] transition", rightPanel === "knowledge" ? "bg-white/12 text-white" : "text-white/40")}
                ><Files className="size-3.5" />知识库</button>
              </div>
              <div className="flex items-center gap-1">
                {rightPanel === "agent" && <button onClick={loadRuns} aria-label="刷新动态" className="flex size-8 items-center justify-center rounded-md text-white/42 hover:bg-white/8 hover:text-white"><ArrowClockwise /></button>}
                <button onClick={() => setOpen(false)} aria-label="关闭" className="flex size-8 items-center justify-center rounded-md text-white/50 hover:bg-white/8 hover:text-white lg:hidden"><X /></button>
              </div>
            </div>

            {/* ── Agent 面板：子标签 ── */}
            {rightPanel === "agent" && (
              <>
                <div className="grid grid-cols-3 gap-1 border-b border-white/10 px-3 py-2">
                  {([
                    { key: "coach" as const, label: "教练", icon: Brain },
                    { key: "workspace" as const, label: "计划", icon: ListChecks },
                    { key: "notifications" as const, label: "通知", icon: ClockCounterClockwise },
                  ]).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setAgentSubTab(tab.key)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                        agentSubTab === tab.key
                          ? "bg-primary/15 text-primary"
                          : "text-white/45 hover:bg-white/[0.06] hover:text-white"
                      )}
                    >
                      <tab.icon className="size-3.5" weight={agentSubTab === tab.key ? "fill" : "regular"} />
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" key={agentSubTab}>
                  <div className="rainforest-panel-content">
                    {agentSubTab === "coach" && <CoachOverview />}
                    {agentSubTab === "workspace" && <AgentWorkspace initialRuns={runs} />}
                    {agentSubTab === "notifications" && <NotificationCenter />}
                  </div>
                </div>
              </>
            )}

            {/* ── 知识库面板 ── */}
            {rightPanel === "knowledge" && (
              <div className="min-h-0 flex-1 overflow-y-auto" key="knowledge">
                <div className="rainforest-panel-content">
                  <KnowledgeBase />
                </div>
              </div>
            )}
          </aside>

          <nav className="rainforest-mobile-nav lg:hidden">
            {([{ key: "history", label: "记录", icon: ChatsCircle }, { key: "chat", label: "探索", icon: Sparkle }, { key: "agent", label: "动态", icon: Robot }, { key: "knowledge", label: "知识库", icon: Files }] as const).map((item) => <button key={item.key} onClick={() => { setMobilePanel(item.key); if (item.key === "agent" || item.key === "knowledge") setRightPanel(item.key); }} className={cn(mobilePanel === item.key && "text-[#d7ef83]")}><item.icon weight={mobilePanel === item.key ? "fill" : "regular"} /><span>{item.label}</span></button>)}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
