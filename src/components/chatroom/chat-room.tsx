"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretLeft,
  ChatsCircle,
  Hash,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Users,
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

interface ChatMessage {
  id: string;
  roomId: string;
  userId: string | null;
  userName: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface Room {
  id: string;
  name: string;
  _count?: { members: number; messages: number };
}

interface RoomHistoryMessage {
  id: string;
  roomId: string;
  userId: string | null;
  role: string;
  content: string;
  createdAt: string;
  user: { name: string | null } | null;
}

type ServerMessage =
  | { type: "ready"; user: { id: string; name: string; image: string | null } }
  | { type: "joined"; roomId: string }
  | { type: "message"; message: ChatMessage }
  | { type: "ai:start"; roomId: string }
  | { type: "ai:delta"; roomId: string; content: string }
  | { type: "ai:done"; roomId: string; message: ChatMessage }
  | { type: "presence"; roomId: string; online: number }
  | { type: "pong" }
  | { type: "error"; code: string; reason: string };

const STREAMING_ID = "__ai_streaming__";

// 头像底色：按昵称稳定分配，避免每次刷新换色
const AVATAR_COLORS = [
  "bg-emerald-500/85 text-emerald-950",
  "bg-sky-500/85 text-sky-950",
  "bg-amber-500/85 text-amber-950",
  "bg-rose-500/85 text-rose-950",
  "bg-violet-500/85 text-violet-950",
  "bg-teal-500/85 text-teal-950",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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

// 用于把相邻的同发送者消息归为一组
function senderKey(m: ChatMessage): string {
  if (m.role === "assistant") return "ai";
  if (m.role === "system") return "sys";
  return `u:${m.userId ?? "anon"}`;
}

export function ChatRoom() {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [online, setOnline] = useState(0);
  const [connected, setConnected] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const totalUnread = Object.values(unreadByRoom).reduce((a, b) => a + b, 0);
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // 加载房间列表
  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => toast.error("加载房间失败"));
  }, []);

  // 消息处理器（声明在前，供 WebSocket onmessage 引用）
  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "ready":
        setMyId(msg.user.id);
        break;
      case "presence":
        if (msg.roomId === activeRoomRef.current) setOnline(msg.online);
        break;
      case "message": {
        const m = msg.message;
        if (openRef.current && m.roomId === activeRoomRef.current) {
          setMessages((prev) => [...prev, m]);
        } else {
          setUnreadByRoom((prev) => ({
            ...prev,
            [m.roomId]: (prev[m.roomId] ?? 0) + 1,
          }));
        }
        break;
      }
      case "ai:start":
        if (openRef.current && msg.roomId === activeRoomRef.current) {
          setAiStreaming(true);
          setMessages((prev) => [
            ...prev,
            {
              id: STREAMING_ID,
              roomId: msg.roomId,
              userId: null,
              userName: "雨宝",
              role: "assistant",
              content: "",
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        break;
      case "ai:delta":
        if (openRef.current && msg.roomId === activeRoomRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === STREAMING_ID ? { ...m, content: m.content + msg.content } : m
            )
          );
        }
        break;
      case "ai:done":
        if (openRef.current && msg.roomId === activeRoomRef.current) {
          setAiStreaming(false);
          setMessages((prev) =>
            prev.map((m) => (m.id === STREAMING_ID ? msg.message : m))
          );
        }
        break;
      case "error":
        if (msg.code !== "rate_limited") toast.error(msg.reason);
        break;
      default:
        break;
    }
  }, []);

  // WebSocket 常驻连接（用于实时消息 + 未读统计）
  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setOnline(0);
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        handleServerMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* 忽略异常消息 */
      }
    };
    return () => ws.close();
  }, [reconnectKey, handleServerMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 输入框自适应高度
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  async function selectRoom(id: string) {
    setActiveRoomId(id);
    activeRoomRef.current = id;
    setAiStreaming(false);
    setMessages([]);
    setUnreadByRoom((prev) => ({ ...prev, [id]: 0 }));
    const res = await fetch(`/api/rooms/${id}`);
    if (res.ok) {
      const d = (await res.json()) as { room: { messages: RoomHistoryMessage[] } };
      setMessages(
        d.room.messages.map((m) => ({
          id: m.id,
          roomId: m.roomId,
          userId: m.userId,
          userName: m.user?.name ?? null,
          role: m.role as ChatMessage["role"],
          content: m.content,
          createdAt: m.createdAt,
        }))
      );
    }
    wsRef.current?.send(JSON.stringify({ type: "join", roomId: id }));
  }

  function backToList() {
    setActiveRoomId(null);
    activeRoomRef.current = null;
    setAiStreaming(false);
    setMessages([]);
  }

  async function createRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const d = await res.json();
      setRooms((prev) => [d.room, ...prev]);
      setNewRoomName("");
      setCreating(false);
      await selectRoom(d.room.id);
    } else {
      toast.error("创建失败");
    }
  }

  function send() {
    const content = input.trim();
    if (!content || !activeRoomRef.current || !connected) return;
    const clientId = crypto.randomUUID();
    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        roomId: activeRoomRef.current,
        clientId,
        content,
      })
    );
    setInput("");
    inputRef.current?.focus();
  }

  function selectMention() {
    setInput((prev) => prev.replace(/@$/, "@雨宝 "));
    inputRef.current?.focus();
  }

  const showMention = input.endsWith("@");

  return (
    <>
      {/* 触发按钮 + 未读红点 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开聊天室"
        className="relative flex size-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ChatsCircle className="size-4" weight="fill" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="chatroom-dialog flex flex-col gap-0 overflow-hidden rounded-2xl border border-white/12 bg-[#0a1a15]/95 p-0 text-white backdrop-blur-xl"
        >
          <DialogTitle className="sr-only">学习聊天室</DialogTitle>
          <DialogDescription className="sr-only">
            多人实时聊天，@雨宝 唤起 AI 助教
          </DialogDescription>

          {/* 头部 */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.08] px-3 sm:px-4">
            <button
              onClick={backToList}
              aria-label="返回房间列表"
              className="-ml-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground md:hidden"
            >
              <CaretLeft className="size-4" weight="bold" />
            </button>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <ChatsCircle className="size-4" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {activeRoom ? activeRoom.name : "学习聊天室"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {activeRoom
                  ? connected
                    ? `${online} 人在线`
                    : "连接中断"
                  : "选择或创建一个房间开始聊天"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {!connected && (
                <button
                  onClick={() => setReconnectKey((k) => k + 1)}
                  className="rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
                >
                  重连
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>

          {/* 主体：两栏（移动端按需切换） */}
          <div className="flex min-h-0 flex-1">
            {/* 左侧房间列表 */}
            <aside
              className={cn(
                "flex-col border-r border-white/[0.08] bg-white/[0.02] md:flex md:w-60 md:shrink-0",
                activeRoomId ? "hidden" : "flex w-full"
              )}
            >
              <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  房间
                </h2>
                <span className="text-[10px] text-muted-foreground/60">{rooms.length}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
                {rooms.map((room) => {
                  const unread = unreadByRoom[room.id] ?? 0;
                  const active = activeRoomId === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => selectRoom(room.id)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                        active ? "bg-primary/12" : "hover:bg-white/[0.05]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/[0.06] text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        <Hash className="size-4" weight={active ? "fill" : "bold"} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm font-medium",
                            active ? "text-foreground" : "text-foreground/80"
                          )}
                        >
                          {room.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="size-3" />
                          {room._count?.members ?? 0} 位成员
                        </span>
                      </span>
                      {unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
                {rooms.length === 0 && (
                  <div className="flex flex-col items-center px-4 py-12 text-center">
                    <ChatsCircle className="size-7 text-muted-foreground/40" />
                    <p className="mt-3 text-xs text-muted-foreground">还没有房间</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      点击下方按钮创建第一个房间
                    </p>
                  </div>
                )}
              </div>
              {/* 新建房间 */}
              <div className="border-t border-white/[0.08] p-2.5">
                {creating ? (
                  <input
                    autoFocus
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createRoom();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewRoomName("");
                      }
                    }}
                    placeholder="房间名，回车创建"
                    className="h-9 w-full rounded-lg border border-primary/40 bg-white/[0.04] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/12 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="size-4" weight="bold" />
                    新建房间
                  </button>
                )}
              </div>
            </aside>

            {/* 右侧聊天区 */}
            <section
              className={cn(
                "min-w-0 flex-1 flex-col md:flex",
                activeRoomId ? "flex" : "hidden"
              )}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <ChatsCircle className="size-7" weight="fill" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">
                      {activeRoomId ? "开始聊天吧" : "选择或创建一个房间"}
                    </h3>
                    <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">
                      {activeRoomId
                        ? "和伙伴一起交流，输入 @ 唤起 AI 助教雨宝"
                        : "加入一个房间，或新建自己的学习小组"}
                    </p>
                    {activeRoomId && (
                      <button
                        onClick={() => {
                          setInput("@雨宝 ");
                          inputRef.current?.focus();
                        }}
                        className="mt-4 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                      >
                        @雨宝 提问
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col">
                    {messages.map((m, i) => (
                      <MessageRow
                        key={m.id}
                        message={m}
                        isMine={m.userId !== null && m.userId === myId}
                        grouped={
                          i > 0 && senderKey(messages[i - 1]) === senderKey(m)
                        }
                        isFirst={i === 0}
                      />
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* 输入框 + @提及 */}
              <div className="shrink-0 border-t border-white/[0.08] p-3 sm:p-4">
                <div className="relative mx-auto max-w-3xl">
                  {showMention && (
                    <button
                      onClick={selectMention}
                      className="absolute -top-14 left-0 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0f241c] px-3 py-2 shadow-xl transition-colors hover:bg-[#13302a]"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Sparkle className="size-4" weight="fill" />
                      </span>
                      <span className="text-left">
                        <span className="block text-xs font-medium text-foreground">雨宝</span>
                        <span className="block text-[10px] text-muted-foreground">AI 助教</span>
                      </span>
                    </button>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 transition-colors focus-within:border-primary/40">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder={
                        activeRoomId ? "说点什么… 输入 @ 唤起雨宝" : "先选择或创建房间"
                      }
                      disabled={!activeRoomId}
                      className="max-h-32 min-h-6 flex-1 resize-none border-0 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                    />
                    <button
                      onClick={send}
                      disabled={!input.trim() || !connected || aiStreaming}
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
                      aria-label="发送"
                    >
                      <PaperPlaneTilt className="size-4" weight="fill" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
                    输入 @ 唤起雨宝 · Enter 发送 · Shift+Enter 换行
                  </p>
                </div>
              </div>
            </section>
          </div>
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
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const isAI = message.role === "assistant";
  const isStreaming = message.id === STREAMING_ID;
  const initial = (message.userName ?? "?").charAt(0).toUpperCase();
  const color = avatarColor(message.userName ?? "user");

  return (
    <div
      className={cn(
        "flex items-end gap-2.5",
        isMine ? "flex-row-reverse" : "flex-row",
        isFirst ? "" : grouped ? "mt-1" : "mt-5"
      )}
    >
      {/* 头像 */}
      {isAI ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-primary ring-1 ring-primary/20">
          <Sparkle className="size-4" weight="fill" />
        </div>
      ) : (
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            color
          )}
        >
          {initial}
        </div>
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
              <>
                <span className="text-xs font-semibold text-primary">雨宝</span>
                <span className="rounded-sm bg-primary/12 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                  AI
                </span>
              </>
            ) : !isMine ? (
              <span className="text-xs font-medium text-foreground/80">
                {message.userName ?? "用户"}
              </span>
            ) : null}
            <span className="text-[10px] tabular-nums text-muted-foreground/60">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isAI
              ? "rounded-bl-sm bg-white/[0.06] text-foreground/90 ring-1 ring-white/[0.06]"
              : isMine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-white/[0.08] text-foreground/90"
          )}
        >
          {message.content ? (
            <>
              {message.content}
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
