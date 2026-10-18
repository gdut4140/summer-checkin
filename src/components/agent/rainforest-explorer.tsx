"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  CaretLeft,
  ChatsCircle,
  Files,
  MagicWand,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { MessageBubble } from "@/components/ai/message-bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { KnowledgeBase } from "./knowledge-base";
import { isViewParts, partsText, toViewParts, type ChatUIMessage } from "@/lib/ai/parts";
import type { ChatMessage } from "@/types";
import { useSceneCopy } from "@/context/scene-context";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

type MobilePanel = "history" | "chat" | "knowledge";

/** /api/conversations/[id] 返回的一条消息（Prisma 行原样） */
interface MessageDTO {
  id: string;
  role: string;
  content: string;
  parts?: unknown;
  createdAt: string;
}

/**
 * 数据库行 → 界面消息。
 *
 * parts 可能是 null（2026-10 之前的存量行，或studio 面板写的纯文本消息），
 * 那时回落到把 content 当一段文本——与 MessageBubble 的回落分支是同一套判断。
 */
function dtoToChatMessage(dto: MessageDTO, createdAt: Date): ChatMessage {
  return {
    id: dto.id,
    role: dto.role === "user" ? "user" : "assistant",
    content: dto.content,
    parts: isViewParts(dto.parts) ? dto.parts : undefined,
    createdAt,
  };
}

/** 历史消息回传模型时的最小形状——只要文本，不带 parts */
interface HistoryPayload {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** 随每次请求递进 transport 的额外字段（见 sendMessage 的 options.body） */
interface ChatRequestBody {
  conversationId?: string;
  deepThink?: boolean;
  history?: HistoryPayload[];
}

/**
 * 回传给模型的形状：**只保留纯文本**。
 *
 * 工具调用的入参可能大得离谱（updateDocument 就是整篇文档），而且今天的实现
 * 本来也不把它们回传给模型。剥成纯文本既保持了原有的 token 画像，又顺带避开了
 * 「有 tool-call 没有 tool-result」这类非法消息（被中断的一轮会留下这种残骸）。
 * 想改成让模型看见自己刚做过什么，只动这一个函数即可。
 */
function toModelMessages(
  history: readonly HistoryPayload[],
  live: readonly ChatUIMessage[]
): ChatUIMessage[] {
  const merged = [
    ...history.map((m) => ({ id: m.id, role: m.role, text: m.content })),
    ...live.map((m) => ({ id: m.id, role: m.role, text: partsText(m.parts) })),
  ];
  return merged
    .filter((m) => m.text.trim() !== "")
    .slice(-40)
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text" as const, text: m.text }],
    }));
}

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
  /**
   * 历史消息（来自数据库）。
   *
   * 与 useChat 手里的「本轮直播消息」**分开存**，渲染时拼起来：
   * 历史里的 parts 是落库形状（ViewPart），直播里的是 AI SDK 形状（UIMessagePart）。
   * 硬塞进同一个容器，要么来回转换丢信息，要么得在 useChat 外面伪造 UIMessage
   * （而工具 part 的构造要求 input/output，我们落库时恰恰把它们裁掉了）。
   * 分开放之后，切换对话时清空直播列表就够了。
   */
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 从「新建计划」跳转（/agent?new=1 → initialPlanner）时预填目标提示
  const [input, setInput] = useState(initialPlanner ? "为我制定一个 7 天学习计划，目标是：" : "");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [deepThink, setDeepThink] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadedRef = useRef(false);
  const initialMsgCountRef = useRef<number>(0);
  // 侧栏刷新回调。refreshConversations 的身份每次都变，而 effect 的依赖只想挂在
  // status 上，所以用 ref 转一手（在 effect 里读写，不碰渲染期）。
  const refreshRef = useRef<() => void>(() => {});

  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/ai",
        // ⚠️ 自定义 fetch 是**唯一**能拿到 X-Conversation-Id 的地方：AI SDK 的
        // transport 把 Response 对象吃掉后只交出 body，没有任何 onResponse 钩子。
        fetch: async (request, init) => {
          const response = await fetch(request, init);
          const id = response.headers.get("X-Conversation-Id");
          if (id) setActiveId(id);
          return response;
        },
        // 每请求的会话归属 / 开关 / 历史都在 sendMessage 的 options.body 里递进来，
        // 不在这里读组件 state——transport 只会被创建一次，闭包读 state 会永远拿到初值。
        prepareSendMessagesRequest: ({ messages: live, body }) => {
          const extra = (body ?? {}) as ChatRequestBody;
          return {
            body: {
              protocol: "ui",
              conversationId: extra.conversationId,
              deepThink: extra.deepThink,
              messages: toModelMessages(extra.history ?? [], live),
            },
          };
        },
      })
  );

  const {
    messages: liveMessages,
    sendMessage: sendToModel,
    setMessages: setLiveMessages,
    stop,
    status,
  } = useChat<ChatUIMessage>({
    transport,
    onError: (error) => {
      // 每日精力用完不是错误（服务端会正常流回一段文案）；能走到这里的都是真故障
      toast.error(error.message || "AI 回复失败");
    },
  });

  /** 直播中的助手消息 id——用来只给正在生成的那条气泡显示「思考中…」 */
  const lastLive = liveMessages.at(-1);
  const streamingId =
    (status === "streaming" || status === "submitted") && lastLive?.role === "assistant"
      ? lastLive.id
      : null;

  const messages = useMemo<ChatMessage[]>(() => {
    const out: ChatMessage[] = [...history];
    for (const message of liveMessages) {
      // 时间戳：用户消息由 sendMessage 随 metadata 递进来；助手消息服务端**不再**
      // 下发（原因见 route.ts：messageMetadata 会被每个 part 触发一次，白白让线上
      // chunk 数翻倍），就近沿用上一条的时间——一轮对话里两者只差几秒。
      // 渲染必须是纯函数，所以不能就地 Date.now()。
      const iso = message.metadata?.createdAt;
      out.push({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: partsText(message.parts),
        parts: toViewParts(message.parts),
        createdAt: iso ? new Date(iso) : (out.at(-1)?.createdAt ?? new Date(0)),
      });
    }
    return out;
  }, [history, liveMessages]);

  const loading = status === "submitted" || status === "streaming";

  /**
   * 等首字节期间的占位气泡。
   *
   * 实测首字节要 7～12 秒才到——瓶颈是免费档模型的**首 token 延迟**，不是建会话
   * 那点数据库开销（做过对照：跳过标题生成反而更慢，纯粹是模型抖动）。而
   * streamTextWithFallback 为了暴露 403 必须剥到第一个 chunk 才返回，所以连响应头
   * 都要等模型开口。这段时间如果什么都不显示，用户看到的就是「完全空白」。
   * useChat 未必会立刻插一条空的助手消息，所以自己兜一个：最后一条不是助手消息时，
   * 补一个「思考中」气泡。
   */
  const awaitingReply = loading && messages.at(-1)?.role !== "assistant";

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
    if (!nearBottomRef.current) return;
    // ⚠️ 生成过程中必须用瞬时滚动（auto）。
    // messages 每来一个 chunk 就变一次，effect 就会再调一次 scrollIntoView；
    // 用 smooth 的话，前一段平滑动画还没跑完就被下一段接管，视口会在半路被
    // 反复改变目标——看到的就是窗口上下抽搐。瞬时滚动没有可被打断的动画，
    // 表现成正文自然向下生长。
    // 非生成态（切对话、载入历史）仍然用 smooth，那是一次性的、好看的。
    //
    // 滚动容器上还挂了 [overflow-anchor:none]（浏览器自带的滚动锚定）。默认的
    // 锚定会在内容高度变化时自行调整 scrollTop，与我们这里的 scrollIntoView 抢
    // 方向盘；聊天列表始终贴在底部，用不上它，关掉更可控。
    bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" });
  }, [messages, loading]);

  // 进入智能体页即聚焦输入框（双 rAF 等布局稳定；新建计划场景由 initialPlanner 初始化内容）
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => inputRef.current?.focus());
    });
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
    setHistory(
      (data.messages as MessageDTO[]).map((message) =>
        dtoToChatMessage(message, new Date(message.createdAt))
      )
    );
    // 换对话 = 丢弃上一轮的直播消息，否则两段对话会拼在一起
    setLiveMessages([]);
    setActiveId(id);
    initialMsgCountRef.current = data.messages.length;
    setMobilePanel("chat");
  }, [updateTitleIfNeeded, setLiveMessages]);

  const refreshConversations = useCallback(async (selectLatest = false) => {
    // 显式只取智能体页的对话：工作台（文档/计划）的对话也在同一张表里
    const response = await fetch("/api/conversations?surface=agent");
    if (!response.ok) return;
    const data = await response.json();
    const list = (data.conversations ?? []) as Conversation[];
    setConversations(list);
    if (selectLatest && list[0]) await loadConversation(list[0].id);
  }, [loadConversation]);

  // 把最新的刷新回调交给下面那个只看 status 的 effect
  useEffect(() => {
    refreshRef.current = () => void refreshConversations();
  }, [refreshConversations]);

  // 一轮对话结束（含被中断）就刷新侧栏：新会话要出现在列表里，
  // 标题也可能刚被 updateTitleIfNeeded 改过
  useEffect(() => {
    if (status === "ready") refreshRef.current();
  }, [status]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refreshConversations(true);
  }, [refreshConversations]);

  function startNewConversation() {
    // 离开旧对话前更新标题
    updateTitleIfNeeded();
    setActiveId(null);
    setHistory([]);
    setLiveMessages([]);
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
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function sendMessage() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());

    // 会话归属 / 开关 / 历史在这里从**当前** state 取（这个函数每次渲染都重建，
    // 闭包里的值是最新的），再经 options.body 递进 transport 的
    // prepareSendMessagesRequest。乐观渲染（用户气泡 + 空助手气泡）由 useChat 负责。
    void sendToModel(
      { text: content, metadata: { createdAt: new Date().toISOString() } },
      {
        body: {
          conversationId: activeId ?? undefined,
          deepThink,
          history: history.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        },
      }
    );
  }

  function stopMessage() {
    void stop();
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
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-4 py-5 sm:px-7 [overflow-anchor:none]">
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
                <div className="mx-auto max-w-3xl space-y-5">{messages.map((message) => <MessageBubble key={message.id} message={message} streaming={message.id === streamingId} />)}{awaitingReply ? <MessageBubble message={{ id: "pending-reply", role: "assistant", content: "", createdAt: messages.at(-1)?.createdAt ?? new Date(0) }} streaming /> : null}<div ref={bottomRef} /></div>
              )}
            </div>
            <div className="border-t border-white/10 bg-black/10 p-3 sm:p-4">
              <div className="mx-auto max-w-3xl rounded-lg border border-white/12 bg-white/6 p-2 focus-within:border-primary/42">
                <Textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="问一个问题，或说说你卡在哪里…" className="min-h-16 max-h-40 resize-none overflow-y-auto border-0 bg-transparent px-2 shadow-none focus-visible:ring-0" />
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
