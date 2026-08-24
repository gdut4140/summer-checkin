"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChatsCircle,
  PaperPlaneTilt,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AppAvatar } from "@/components/ui/app-avatar";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface ChatMessage {
  id: string;
  userId: string | null;
  userName: string | null;
  image: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  /** 两个雨宝：gentle = 温柔宝（粉色头像），snarky = 嘴欠宝（雨宝） */
  aiRole?: "gentle" | "snarky";
}

type ServerMessage =
  | { type: "ready"; user: { id: string; name: string; image: string | null } }
  | { type: "message"; message: ChatMessage }
  | { type: "ai:start"; requestId: string; aiRole: "gentle" | "snarky" }
  | { type: "ai:delta"; requestId: string; content: string }
  | { type: "ai:done"; requestId: string; message: ChatMessage }
  | { type: "presence"; online: number }
  | { type: "pong" }
  | { type: "error"; code: string; reason: string };

// 两个雨宝当成两个不同"用户"：固定的虚拟 userId，消息按各自用户分组渲染
const AI_IDS = { gentle: "ai-gentle", snarky: "ai-snarky" } as const;

function getWsUrl(): string {
  const host = window.location.hostname;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.port === "3000") return `ws://${host}:3001/ws`;
  return `${protocol}//${window.location.host}/ws`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function senderKey(m: ChatMessage): string {
  // 温柔宝/嘴欠宝按各自虚拟用户分组，当成两个不同用户，不互相合并
  if (m.role === "assistant") {
    const isGentle = m.userId === AI_IDS.gentle || m.userName === "温柔宝";
    return isGentle ? "ai:gentle" : "ai:snarky";
  }
  if (m.role === "system") return "sys";
  return `u:${m.userId ?? "anon"}`;
}

export function ChatRoom() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [online, setOnline] = useState(0);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [unread, setUnread] = useState(0);
  // 是否钉在底部（自动滚动）；上滑阅读时为 false
  const [atBottom, setAtBottom] = useState(true);
  // 上滑阅读期间漏掉的新消息数
  const [newCount, setNewCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  // 拉取历史期间通过 WebSocket 实时到达的消息，整体替换后补回，避免被冲掉
  const liveWindow = useRef<ChatMessage[] | null>(null);
  const openRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const myIdRef = useRef<string | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // 供事件回调（无依赖闭包）读取最新值
  useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  const loadHistory = useCallback(() => {
    // 打开本次拉取窗口：期间实时到达的消息缓存起来，替换快照时补回
    liveWindow.current = [];
    fetch("/api/chat/messages", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: ChatMessage[] = (d.messages ?? []).map(
          (m: {
            id: string;
            userId: string | null;
            role: string;
            content: string;
            createdAt: string;
            aiRole?: string | null;
            user?: { name: string | null; image: string | null } | null;
          }) => {
            const role = m.role as ChatMessage["role"];
            if (role !== "assistant") {
              return {
                id: m.id,
                userId: m.userId,
                userName: m.user?.name ?? null,
                image: m.user?.image ?? null,
                role,
                content: m.content,
                createdAt: m.createdAt,
              };
            }
            // AI 消息：优先用数据库的虚拟 userId（新消息已落库）；旧消息按 aiRole / 用户名兜底
            const isGentle =
              m.userId === AI_IDS.gentle ||
              m.aiRole === "gentle" ||
              m.user?.name === "温柔宝";
            return {
              id: m.id,
              userId: m.userId ?? (isGentle ? AI_IDS.gentle : AI_IDS.snarky),
              userName: isGentle ? "温柔宝" : "嘴欠宝",
              image: m.user?.image ?? null,
              role,
              content: m.content,
              createdAt: m.createdAt,
              aiRole: isGentle ? "gentle" : "snarky",
            };
          }
        );
        setMessages((prev) => {
          // 快照是权威数据，整体替换——数据库删掉的消息随之从页面消失；
          // 补回拉取窗口内实时到达的消息，以及正在流式输出的 AI 占位气泡
          const windowed = liveWindow.current ?? [];
          liveWindow.current = null;
          const byId = new Map(list.map((m) => [m.id, m]));
          for (const m of windowed) byId.set(m.id, m);
          // 保留所有正在流式的 AI 占位气泡（id 以 ai- 开头，避免被历史快照冲掉）
          for (const m of prev) {
            if (m.id.startsWith("ai-")) byId.set(m.id, m);
          }
          return [...byId.values()].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      })
      .catch(() => {
        liveWindow.current = null;
        toast.error("加载聊天记录失败");
      });
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 打开聊天室时：清未读 + 钉到底部 + 刷新历史（把关闭期间漏掉的消息拉回来）。
  // 顶栏按钮直接 setOpen(true) 不走 onOpenChange，所以两条打开路径都要执行这里的逻辑。
  const prepareOpen = useCallback(() => {
    setUnread(0);
    setAtBottom(true);
    setNewCount(0);
    loadHistory();
  }, [loadHistory]);

  const openChat = useCallback(() => {
    setOpen(true);
    prepareOpen();
  }, [prepareOpen]);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "ready":
        setMyId(msg.user.id);
        myIdRef.current = msg.user.id;
        break;
      case "presence":
        setOnline(msg.online);
        break;
      case "message": {
        const m = msg.message;
        // 拉取历史期间到达的实时消息：先缓存，等 loadHistory 整体替换时补回
        if (liveWindow.current) liveWindow.current.push(m);
        if (openRef.current) {
          setMessages((prev) => [...prev, m]);
          // 上滑阅读时：别人的新消息计入未读（自己发的除外）
          const isMine = m.userId !== null && m.userId === myIdRef.current;
          if (!isMine && !atBottomRef.current) setNewCount((c) => c + 1);
        } else {
          setUnread((prev) => prev + 1);
        }
        break;
      }
      case "ai:start":
        if (openRef.current) {
          const aiRole = msg.aiRole ?? "snarky";
          // 每个 AI 请求一个独立占位气泡（id=requestId），支持同时 @ 两个雨宝各自流式
          setMessages((prev) => [
            ...prev,
            {
              id: msg.requestId,
              userId: AI_IDS[aiRole],
              userName: aiRole === "gentle" ? "温柔宝" : "嘴欠宝",
              image: null,
              role: "assistant",
              aiRole,
              content: "",
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        break;
      case "ai:delta":
        if (openRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.requestId ? { ...m, content: m.content + msg.content } : m
            )
          );
        }
        break;
      case "ai:done":
        if (openRef.current) {
          // server DTO 不带 userId：按名字补上虚拟 userId，让两个宝像两个不同用户
          const doneMsg: ChatMessage = msg.message.userId
            ? msg.message
            : {
                ...msg.message,
                userId:
                  msg.message.userName === "温柔宝" ? AI_IDS.gentle : AI_IDS.snarky,
              };
          setMessages((prev) => {
            // 该消息已在列表（历史快照拉到）：只移除占位，避免同 id 重复
            if (prev.some((m) => m.id === doneMsg.id)) {
              return prev.filter((m) => m.id !== msg.requestId);
            }
            return prev.map((m) => (m.id === msg.requestId ? doneMsg : m));
          });
          // 上滑阅读时：AI 完成回复也算一条新消息
          if (!atBottomRef.current) setNewCount((c) => c + 1);
        }
        break;
      case "error":
        if (msg.code !== "rate_limited") toast.error(msg.reason);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
    };
    ws.onclose = () => {
      setConnected(false);
      setReconnecting(false);
      setOnline(0);
    };
    ws.onerror = () => {
      setConnected(false);
      setReconnecting(false);
    };
    ws.onmessage = (e) => {
      try {
        handleServerMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* 忽略异常消息 */
      }
    };
    return () => ws.close();
  }, [reconnectKey, handleServerMessage]);

  function handleReconnect() {
    setReconnecting(true);
    setReconnectKey((k) => k + 1);
  }

  // 直接滚到容器底部（比 scrollIntoView 更可靠，不受弹窗动画/祖先滚动干扰）
  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current;
    if (!el) return;
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }

  // 用户在消息区滚动：离开底部 → 停止自动滚动；回到底部 → 清空未读气泡
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 24) {
      setAtBottom(true);
      setNewCount(0);
    } else {
      setAtBottom(false);
    }
  }

  // 每次打开弹窗：等入场动画结束、容器布局稳定后滚到底部
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => scrollToBottom(), 160);
    return () => clearTimeout(t);
  }, [open]);

  // 有新消息且仍钉在底部时自动滚动；上滑阅读时不打断
  useEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function send() {
    const content = input.trim();
    if (!content || !connected) return;
    // 纯 HTTP（非安全上下文）下 crypto.randomUUID 不可用，需兜底（与 focus-timer 一致）
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        clientId,
        content,
      })
    );
    setInput("");
    inputRef.current?.focus();
  }

  function selectMention(target: "gentle" | "snarky") {
    setInput((prev) =>
      prev.replace(/@$/, target === "gentle" ? "@温柔宝 " : "@嘴欠宝 ")
    );
    inputRef.current?.focus();
  }

  const showMention = input.endsWith("@");

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={openChat}
            aria-label="打开聊天室"
            className="relative flex size-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 hover:text-primary"
          />
        }>
          <ChatsCircle className="size-4" weight="fill" />
          {/* 主题色小圆点提示有新消息，不显示条数 */}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary shadow-[0_0_6px_color-mix(in_srgb,var(--theme-primary)_50%,transparent)]" />
          )}
        </TooltipTrigger>
        <TooltipContent>聊天室</TooltipContent>
      </Tooltip>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) prepareOpen();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="chatroom-dialog flex flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground"
        >
          <DialogTitle className="sr-only">学习聊天室</DialogTitle>
          <DialogDescription className="sr-only">
            多人实时聊天，@雨宝 唤起 雨宝
          </DialogDescription>

          {/* 头部 */}
          <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <ChatsCircle className="size-4" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                聊天室
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {connected
                  ? `${online} 人在线`
                  : "连接中断"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {!connected && (
                <button
                  onClick={handleReconnect}
                  disabled={reconnecting}
                  className="flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-60"
                >
                  {reconnecting ? (
                    <>
                      <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      重连中
                    </>
                  ) : (
                    "重连"
                  )}
                </button>
              )}
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  />
                }>
                  <X className="size-4" />
                </TooltipTrigger>
                <TooltipContent>关闭</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* 主体 */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* 聊天区 */}
            <section className="flex min-w-0 min-h-0 flex-1 flex-col">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-3 py-4 sm:px-5"
              >
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <ChatsCircle className="size-7" weight="fill" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">
                      开始聊天吧
                    </h3>
                    <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">
                      和伙伴一起交流，输入 @ 唤起嘴欠宝 / 温柔宝
                    </p>
                    <button
                      onClick={() => {
                        setInput("@温柔宝 ");
                        inputRef.current?.focus();
                      }}
                      className="mt-4 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                    >
                      @温柔宝 提问
                    </button>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col">
                    {messages.map((m, i) => {
                      const prev = i > 0 ? messages[i - 1] : null;
                      const sameSender = prev && senderKey(prev) === senderKey(m);
                      // 间隔超过 5 分钟也不合并，显示独立时间戳
                      const tooFarApart =
                        prev &&
                        new Date(m.createdAt).getTime() -
                          new Date(prev.createdAt).getTime() >
                          5 * 60 * 1000;
                      return (
                        <MessageRow
                          key={m.id}
                          message={m}
                          isMine={m.userId !== null && m.userId === myId}
                          grouped={Boolean(sameSender && !tooFarApart)}
                          isFirst={i === 0}
                        />
                      );
                    })}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* 输入框 + @提及 */}
              <div className="shrink-0 border-t border-border/60 p-3 sm:p-4">
                <div className="relative mx-auto max-w-3xl">
                  {showMention && (
                    <div className="absolute -top-14 left-0 flex flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => selectMention("gentle")}
                        onMouseEnter={() => setMentionIndex(0)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
                          mentionIndex === 0 ? "bg-primary/12" : "hover:bg-primary/8"
                        )}
                      >
                        <span className={cn(
                          "flex size-7 items-center justify-center",
                          "rounded-full",
                          "bg-pink-200",
                          "ring-1 ring-pink-200/60",
                          "shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset,0_4px_12px_rgba(244,114,182,0.25)]",
                          "text-pink-900",
                        )}>
                          <Sparkle className="size-4" weight="fill" />
                        </span>
                        <span className="text-left">
                          <span className="block text-xs font-medium text-foreground">温柔宝</span>
                          <span className="block text-[10px] text-muted-foreground">温柔版</span>
                        </span>
                        {mentionIndex === 0 && <ArrowRight className="ml-1 size-3 shrink-0 text-primary" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectMention("snarky")}
                        onMouseEnter={() => setMentionIndex(1)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors",
                          mentionIndex === 1 ? "bg-primary/12" : "hover:bg-primary/8"
                        )}
                      >
                        <span className={cn(
                          "flex size-7 items-center justify-center",
                          "rounded-full",
                          "bg-primary",
                          "ring-1 ring-primary/40",
                          "shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_4px_12px_rgba(0,0,0,0.20),0_0_18px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]",
                          "text-[color:color-mix(in_oklab,var(--color-primary-foreground)_55%,white)]",
                        )}>
                          <Sparkle className="size-4" weight="fill" />
                        </span>
                        <span className="text-left">
                          <span className="block text-xs font-medium text-foreground">嘴欠宝</span>
                          <span className="block text-[10px] text-muted-foreground">嘴欠版</span>
                        </span>
                        {mentionIndex === 1 && <ArrowRight className="ml-1 size-3 shrink-0 text-primary" />}
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-border bg-foreground/[0.04] px-3 py-2 transition-colors focus-within:border-primary/40">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (input.endsWith("@")) {
                          // @ 面板：↑/↓ 切换高亮，Enter 选中当前项
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setMentionIndex((i) => (i + 1) % 2);
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setMentionIndex((i) => (i - 1 + 2) % 2);
                            return;
                          }
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            selectMention(mentionIndex === 0 ? "gentle" : "snarky");
                            return;
                          }
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder="说点什么… 输入 @ 唤起嘴欠宝 / 温柔宝"
                      className="max-h-32 min-h-6 flex-1 resize-none border-0 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <Tooltip>
                      <TooltipTrigger render={
                        <button
                          onClick={send}
                          disabled={!input.trim() || !connected}
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
                          aria-label="发送"
                        />
                      }>
                        <PaperPlaneTilt className="size-4" weight="fill" />
                      </TooltipTrigger>
                      <TooltipContent>发送</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </section>

            {/* 上滑阅读期间漏掉新消息：主题色气泡，点击回到底部 */}
            {!atBottom && newCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAtBottom(true);
                  setNewCount(0);
                  scrollToBottom("smooth");
                }}
                className="absolute bottom-18 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105"
              >
                {newCount} 条新消息
              </button>
            )}
          </div>

          {/* 断线遮罩 */}
          {!connected && (
            <div className="absolute inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-background/80"
              />
              <div
                className="relative mx-4 w-full max-w-xs overflow-hidden rounded-2xl border border-border p-6 text-center bg-background"
              >
                {/* 主题装饰 */}
                <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
                <div className="pointer-events-none absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-primary/10 blur-3xl" />

                <div className="relative flex flex-col items-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 mb-4">
                    {reconnecting ? (
                      <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <X className="size-6 text-primary" weight="bold" />
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {reconnecting ? "正在重连…" : "连接已断开"}
                  </h3>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {reconnecting
                      ? "请稍候，正在尝试重新连接服务器"
                      : "网络连接已中断，重连后即可继续聊天"}
                  </p>
                  <button
                    onClick={handleReconnect}
                    disabled={reconnecting}
                    className="mt-5 w-full rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {reconnecting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        重连中…
                      </span>
                    ) : (
                      "点击重连"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageRow({
  message,
  isMine,
  grouped,
  isFirst,
}: {
  message: ChatMessage;
  isMine: boolean;
  grouped: boolean;
  isFirst: boolean;
}) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-foreground/[0.06] px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const isAI = message.role === "assistant";
  const isGentle = isAI && (message.aiRole === "gentle" || message.userName === "温柔宝");
  const isStreaming = message.id.startsWith("ai-");

  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        isMine ? "flex-row-reverse" : "flex-row",
        isFirst ? "" : grouped ? "mt-1" : "mt-5"
      )}
    >
      {/* 头像 */}
      {isAI ? (
        // 雨宝 AI 专用图标：圆形实色底 + 对比色闪闪星
        // self-start 覆盖父级 items-end，让头像对齐到内容顶部（名字行起点），避免错位
        <div
          aria-hidden="true"
          className={cn(
            "relative flex self-start size-8 shrink-0 items-center justify-center",
            "rounded-full",
            "mt-1",
            isGentle
              ? // 温柔宝：头像背景固定淡粉，不随主题变化
                "bg-pink-200 ring-1 ring-pink-200/60 shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset,0_4px_14px_rgba(0,0,0,0.16),0_0_14px_rgba(244,114,182,0.3)] text-pink-900"
              : "bg-primary ring-1 ring-primary/40 shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_4px_14px_rgba(0,0,0,0.22),0_0_14px_color-mix(in_oklab,var(--color-primary)_35%,transparent)] text-[color:color-mix(in_oklab,var(--color-primary-foreground)_55%,white)]"
          )}
          title={isGentle ? "温柔宝" : "嘴欠宝"}
        >
          <Sparkle className="size-[20px]" weight="fill" />
        </div>
      ) : (
        <AppAvatar
          image={message.image}
          name={message.userName ?? "用户"}
          size="sm"
          className="size-8"
        />
      )}

      {/* 内容 */}
      <div
        className={cn(
          "flex min-w-0 max-w-[75%] flex-col",
          isMine && "items-end"
        )}
      >
        {!grouped && (
          <div
            className={cn(
              "mb-1 flex items-center gap-1.5",
              isMine && "flex-row-reverse"
            )}
          >
            {isAI ? (
              <span className={cn("text-xs font-semibold", isGentle ? "text-pink-400" : "text-primary")}>
                {isGentle ? "温柔宝" : "嘴欠宝"}
              </span>
            ) : (
              <span className="text-xs font-medium text-foreground/80">
                {message.userName ?? "用户"}
              </span>
            )}
            <span className="text-[10px] tabular-nums text-muted-foreground/60">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        <div
          data-bubble={isAI ? "ai" : isMine ? "user" : "other"}
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isAI
              ? "rounded-bl-sm bg-foreground/[0.06] text-foreground/90 ring-1 ring-foreground/[0.06]"
              : isMine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-foreground/[0.08] text-foreground/90"
          )}
        >
          {message.content ? (
            <>
              {isAI ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                message.content
              )}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-current align-text-bottom" />
              )}
            </>
          ) : (
            <span className="flex items-center gap-0.5 text-foreground/50">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce [animation-delay:120ms]">●</span>
              <span className="animate-bounce [animation-delay:240ms]">●</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
