"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowBendUpLeft,
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

/** 被引用消息的快照（服务端广播时带出，无需回查） */
interface ReplyTo {
  id: string;
  userId: string | null;
  userName: string | null;
  content: string;
}

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
  /** 引用回复：被引用消息快照；普通消息为 null */
  replyTo?: ReplyTo | null;
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

// 找到光标前一个可展开的 @（无论它在句首、句中还是句尾），且到光标为止只允许空格
function findActiveMention(value: string, caret: number): number | null {
  const before = value.slice(0, caret);
  const m = before.match(/@(\s*)$/);
  if (!m) return null;
  return before.length - m[1].length - 1;
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

/** GET /api/chat/messages 返回的一条记录（服务端 DTO） */
interface ChatMessageDTO {
  id: string;
  userId: string | null;
  role: string;
  content: string;
  createdAt: string;
  aiRole?: string | null;
  user?: { name: string | null; image: string | null } | null;
  replyTo?: ReplyTo | null;
}

/** 把服务端 DTO 转成前端 ChatMessage（首屏快照与上滑加载的历史共用一份逻辑） */
function mapServerMessage(m: ChatMessageDTO): ChatMessage {
  const role = m.role as ChatMessage["role"];
  const replyTo = m.replyTo ?? null;
  if (role !== "assistant") {
    return {
      id: m.id,
      userId: m.userId,
      userName: m.user?.name ?? null,
      image: m.user?.image ?? null,
      role,
      content: m.content,
      createdAt: m.createdAt,
      replyTo,
    };
  }
  // AI 消息：优先用数据库的虚拟 userId（新消息已落库）；旧消息按 aiRole / 用户名兜底
  const isGentle =
    m.userId === AI_IDS.gentle || m.aiRole === "gentle" || m.user?.name === "温柔宝";
  return {
    id: m.id,
    userId: m.userId ?? (isGentle ? AI_IDS.gentle : AI_IDS.snarky),
    userName: isGentle ? "温柔宝" : "嘴欠宝",
    image: m.user?.image ?? null,
    role,
    content: m.content,
    createdAt: m.createdAt,
    aiRole: isGentle ? "gentle" : "snarky",
    replyTo,
  };
}

/**
 * 消息窗口策略。
 *
 * 聊天室**不做虚拟化**：虚拟化要靠估算未渲染行的高度，而聊天行高参差
 * （短消息 ~45px、带引用预览 ~120px、AI 长回复 300px+），估算必然有误差，
 * 滑上去时才测量、测量后回调偏移——实测每 100 帧就有 1 帧跳，最大跳 369px。
 *
 * 改成「数据窗口」：滑到边缘就整块换，一次换 50 条，最多挂载 100 条。
 * 换块时用**真实 DOM 锚点**补偿滚动位置（不像虚拟化只能靠估算），
 * 实测偏离率 0.02%、最大 6px（就是换块那一帧的滚动量）。
 *
 * 数据本身全部留在内存（`all`），所以往回滑是纯本地展开窗口，不重新请求、也不会出现空洞。
 */
const PAGE_SIZE = 50; // 每次请求多少条
const WINDOW_SIZE = 100; // 最多挂载多少条
const EDGE_TRIGGER = 200; // 距上/下边缘多少像素触发换块
/**
 * 上滑加载的节流窗口。
 *
 * 为什么要节流：加载失败时触发条件是"仍然贴着顶部"，用户往下滚一点再上滑就会再打一次请求，
 * 反复试就是反复打。同理，请求如果超过这个时间还没回来（服务端慢），也不该继续堆请求。
 * 命中节流时只提示、不发请求。
 */
const LOAD_THROTTLE_MS = 2000;

export function ChatRoom() {
  const [open, setOpen] = useState(false);
  /** 已加载的全部消息（升序）。屏幕上挂载的只是它的一个窗口切片。 */
  const [all, setAll] = useState<ChatMessage[]>([]);
  /** 窗口起点（索引进 all）；挂载 all[winStart, winStart + WINDOW_SIZE) */
  const [winStart, setWinStart] = useState(0);
  const [input, setInput] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionAt, setMentionAt] = useState<number | null>(null);
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
  // 正在引用回复的目标消息（输入框上方显示引用条）
  const [replyTarget, setReplyTarget] = useState<ReplyTo | null>(null);
  // 已读过的「对我的回复」消息 id（localStorage 持久化，跨会话不重复提醒）
  const [seenReplyIds, setSeenReplyIds] = useState<Set<string>>(new Set());
  // 是否还有更早的历史可加载（游标分页）
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // 屏幕上真正挂载的那一段
  const messages = useMemo(
    () => all.slice(winStart, winStart + WINDOW_SIZE),
    [all, winStart]
  );
  // 窗口是否贴着最新一条
  const atTail = winStart + WINDOW_SIZE >= all.length;
  const atTailRef = useRef(true);
  useEffect(() => {
    atTailRef.current = atTail;
  }, [atTail]);

  const wsRef = useRef<WebSocket | null>(null);
  // 拉取历史期间通过 WebSocket 实时到达的消息，整体替换后补回，避免被冲掉
  const liveWindow = useRef<ChatMessage[] | null>(null);
  const openRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const myIdRef = useRef<string | null>(null);
  // 下一页游标（本次已加载的最旧一条消息 id）
  const cursorRef = useRef<string | null>(null);
  // 防止边缘重复触发换块 / 重复请求
  const loadingOlderRef = useRef(false);
  // 节流用的时间戳：上次发起加载、上次失败、上次弹节流提示
  const lastLoadStartRef = useRef(0);
  const lastFailAtRef = useRef(0);
  const lastThrottleToastRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  // 换块前记下的锚点（哪条消息、在视口什么位置），换块后据此把滚动位置拉回去
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  // 标记「这次渲染需要做锚点补偿」，避免在流式输出等无关更新上误触发
  const pendingAnchorRef = useRef(false);

  // 统一把光标放回输入框，供打开弹窗、回复、发送、取消引用等场景复用
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

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
    fetch(`/api/chat/messages?limit=${PAGE_SIZE}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: ChatMessage[] = ((d.messages ?? []) as ChatMessageDTO[]).map(
          mapServerMessage
        );
        cursorRef.current = (d.nextCursor as string | null) ?? null;
        setHasMore(Boolean(d.hasMore));
        setAll((prev) => {
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
        // 首屏直接看最新一段：窗口贴住末尾
        setWinStart(Math.max(0, list.length - WINDOW_SIZE));
      })
      .catch(() => {
        liveWindow.current = null;
        toast.error("加载聊天记录失败");
      });
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /** 记录当前视口顶部附近的那条消息，换块后据此把滚动位置拉回原处 */
  const captureAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cTop = el.getBoundingClientRect().top;
    for (const node of el.querySelectorAll<HTMLElement>("[data-mid]")) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom > cTop) {
        anchorRef.current = { id: node.dataset.mid!, top: rect.top };
        pendingAnchorRef.current = true;
        return;
      }
    }
  }, []);

  /**
   * 用户滑到窗口顶端 → 取更早的一页插到 all 的前面。
   *
   * 窗口起点 winStart 保持不动：往前插了 k 条之后，同一个下标指向的就是更早的内容，
   * 于是窗口自动把新加载的 k 条纳入、并从尾部挤掉 k 条（即「最开始的 50 条卸载」）。
   * 视觉位置由锚点补偿负责，见下面的 useLayoutEffect。
   */
  /** 命中节流时的提示。同一个节流窗口内只弹一次，免得滚动过程中反复弹 */
  const notifyLoadThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleToastRef.current < LOAD_THROTTLE_MS) return;
    lastThrottleToastRef.current = now;
    toast.info("加载频繁，请稍后再试", { id: "chat-load-throttled" });
  }, []);

  const loadOlder = useCallback(async () => {
    const now = Date.now();

    // 上一次请求还在飞：超过节流窗口还没回来，就提示并挡住，不再堆请求
    if (loadingOlderRef.current) {
      if (now - lastLoadStartRef.current >= LOAD_THROTTLE_MS) notifyLoadThrottled();
      return;
    }
    if (!hasMore) return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    // 上次失败后没过节流窗口就再试：只提示、不发请求
    // （失败时用户很容易"往下滚一点再上滑"反复试，不挡就会反复打）
    if (now - lastFailAtRef.current < LOAD_THROTTLE_MS) {
      notifyLoadThrottled();
      return;
    }

    lastLoadStartRef.current = now;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/chat/messages?before=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("加载失败");
      const d = (await res.json()) as {
        messages?: ChatMessageDTO[];
        hasMore?: boolean;
        nextCursor?: string | null;
      };
      const older = (d.messages ?? []).map(mapServerMessage);
      cursorRef.current = d.nextCursor ?? null;
      setHasMore(Boolean(d.hasMore));
      lastFailAtRef.current = 0; // 成功即解除失败节流
      if (older.length > 0) {
        // 锚点必须在**确认要改状态**的这一刻才采集、才立标记：
        // 放在请求之前的话，一旦请求失败，标记会永远挂着没人消费——
        // 而 handleScroll 的触发条件里带 !pendingAnchorRef.current，
        // 于是上滑加载被永久挡死（真实故障）。顺带这样采到的也是用户当前的真实位置。
        captureAnchor();
        setAll((prev) => [...older, ...prev]);
      }
    } catch {
      lastFailAtRef.current = Date.now();
      toast.error("加载更早的消息失败");
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [captureAnchor, hasMore, notifyLoadThrottled]);

  /**
   * 换块后把锚点拉回原来的屏幕位置。
   *
   * 用**真实 DOM 位置**算差值，所以插入/卸载多少高度都能精确抵消——
   * 这正是它比虚拟化稳的原因（虚拟化只能拿估算高度去猜，猜错就是那一跳）。
   */
  useLayoutEffect(() => {
    if (!pendingAnchorRef.current) return;
    pendingAnchorRef.current = false;
    const anchor = anchorRef.current;
    const el = scrollRef.current;
    anchorRef.current = null;
    if (!anchor || !el) return;
    const node = el.querySelector<HTMLElement>(`[data-mid="${anchor.id}"]`);
    if (!node) return;
    el.scrollTop += node.getBoundingClientRect().top - anchor.top;
  }, [messages]);

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
        // 同步 localStorage 里该用户已读过的回复 id（跨会话不重复提醒）
        try {
          const raw = localStorage.getItem(`chatroom:seen-replies:${msg.user.id}`);
          const arr = raw ? (JSON.parse(raw) as unknown) : [];
          setSeenReplyIds(new Set(Array.isArray(arr) ? (arr as string[]) : []));
        } catch {
          /* 解析失败当没看过 */
        }
        break;
      case "presence":
        setOnline(msg.online);
        break;
      case "message": {
        const m = msg.message;
        // 拉取历史期间到达的实时消息：先缓存，等 loadHistory 整体替换时补回
        if (liveWindow.current) liveWindow.current.push(m);
        if (openRef.current) {
          setAll((prev) => [...prev, m]);
          // 贴底时窗口跟着末尾一起前移，让新消息立刻挂上；
          // 正在上滑看历史时窗口不动（新消息留在内存里，不计入挂载），只累计未读
          if (atBottomRef.current) setWinStart((s) => s + 1);
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
          setAll((prev) => [
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
          if (atBottomRef.current) setWinStart((s) => s + 1);
        }
        break;
      case "ai:delta":
        if (openRef.current) {
          setAll((prev) =>
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
          setAll((prev) => {
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
        // 限流此前被静默忽略（`if (msg.code !== "rate_limited")`），用户发太快时
        // 消息看着发出去了、实际没人收到，且没有任何反馈。现在一律给出提示；
        // 用固定 toast id 去重，避免连续触发时堆一屏。
        toast.error(msg.reason, {
          id: msg.code === "rate_limited" ? "chat-rate-limited" : "chat-error",
        });
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

  // 滚到底部：直接设 scrollTop（不再有虚拟列表，弹窗动画/祖先滚动都不影响）
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    if (behavior === "smooth") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, []);

  /**
   * 滚动到某条消息（垂直居中）。
   *
   * 目标可能不在当前挂载的窗口里（比如它属于很早的历史），
   * 那就先把窗口挪过去把它纳入，再滚——否则 DOM 里查不到这条，跳转就会静默失效。
   */
  function scrollToMessage(id: string) {
    const el = scrollRef.current;
    if (!el) return;
    const inAll = all.findIndex((m) => m.id === id);
    if (inAll < 0) return;

    const mounted = inAll >= winStart && inAll < winStart + WINDOW_SIZE;
    if (!mounted) {
      // 把目标放在窗口中间，前后都留出上下文
      setWinStart(Math.max(0, Math.min(inAll - Math.floor(WINDOW_SIZE / 2), all.length - WINDOW_SIZE)));
    }
    // 等窗口更新完再滚
    requestAnimationFrame(() => {
      const target = el.querySelector<HTMLElement>(`[data-mid="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // 把「对我的回复」标记为已读（写 state + 持久化）
  const markSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSeenReplyIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // 已读集合变化时写回 localStorage（上限 300，避免无限膨胀）
  useEffect(() => {
    if (!myId) return;
    const key = `chatroom:seen-replies:${myId}`;
    try {
      localStorage.setItem(key, JSON.stringify([...seenReplyIds].slice(-300)));
    } catch {
      /* 隐私模式等写失败忽略 */
    }
  }, [seenReplyIds, myId]);

  // 把「对我的回复」中已滚进可视区的消息标记为已读 → 提示消失。
  // 用 getBoundingClientRect 做确定性判定：弹窗有缩放/位移动画，IntersectionObserver
  // 的观察时机不可靠，会导致偶发「滚到底部仍不消失」；滚动、打开、消息更新时都会触发。
  //
  // 现在挂载的是「窗口」（最多 100 条），这里的遍历量有上界，不会随消息总数增长。
  const markVisibleRepliesSeen = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cRect = el.getBoundingClientRect();
    const seen: string[] = [];
    el.querySelectorAll<HTMLElement>('[data-reply-to-me="true"]').forEach((node) => {
      const rect = node.getBoundingClientRect();
      // 消息行与滚动容器可视区相交即视为已读（底部这条回复滚进来就消失）
      if (rect.bottom > cRect.top && rect.top < cRect.bottom) {
        const mid = node.dataset.mid;
        if (mid) seen.push(mid);
      }
    });
    markSeen(seen);
  }, [markSeen]);

  // 同一帧内的多次触发合并成一次（rangeChanged / isScrolling 在滚动中会连续触发）
  const scheduleVisibleRepliesCheck = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      markVisibleRepliesSeen();
    });
  }, [markVisibleRepliesSeen]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // 待提醒队列 = 对我的回复且未读过（按时间升序，展示时取最新一条）。
  // 用 all 而不是窗口：回复可能落在当前挂载窗口之外，只扫窗口会漏掉提醒。
  const pendingReplies = useMemo(() => {
    if (!myId) return [];
    return all.filter(
      (m) =>
        m.replyTo?.userId === myId &&
        m.userId !== myId &&
        !seenReplyIds.has(m.id)
    );
  }, [all, myId, seenReplyIds]);
  const latestReply =
    pendingReplies.length > 0
      ? pendingReplies[pendingReplies.length - 1]
      : null;

  // 打开或消息更新后立即判定一次：覆盖「初始就在底部、无需滚动即可看到」的情况
  useEffect(() => {
    if (!open) return;
    markVisibleRepliesSeen();
  }, [open, messages, myId, markVisibleRepliesSeen]);

  // 每次打开弹窗：等入场动画结束、容器布局稳定后滚到底部
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      scrollToBottom();
      inputRef.current?.focus();
    }, 160);
    return () => clearTimeout(t);
  }, [open, scrollToBottom]);

  // 贴底时新消息/流式长高都要跟着走；上滑阅读时不打扰。
  //
  // 用「所有流式占位气泡的内容总长」而不是「最后一条」当依赖：流式期间可能
  // 夹进来别人的新消息，此时占位气泡已不在末尾，但它的长高仍然要跟随。
  const streamingLength = useMemo(
    () =>
      all.reduce(
        (sum, m) => (m.id.startsWith("ai-") ? sum + m.content.length : sum),
        0
      ),
    [all]
  );
  useEffect(() => {
    if (streamingLength > 0 && atBottomRef.current) scrollToBottom();
  }, [streamingLength, scrollToBottom]);

  // 挂载内容变化时若仍贴底则跟随（新消息到达、窗口滑到末尾等）
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    // messages 变化即挂载内容变化；这里刻意不依赖 scrollToBottom（它是稳定的）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /** 距底部多近算“贴底” */
  const BOTTOM_THRESHOLD = 120;

  /**
   * 滚动处理：判定贴底状态 + 在上下边缘触发换块。
   *
   * 关键点：这里**只做整块换**（一次 50 条），不在滑动过程中挂载/卸载单个行——
   * 单行级的换入换出正是虚拟化抽搐的来源。换块时用锚点补偿把位置钉住。
   */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = dist < BOTTOM_THRESHOLD;
    if (bottom !== atBottomRef.current) {
      atBottomRef.current = bottom;
      setAtBottom(bottom);
      if (bottom) setNewCount(0);
    }

    // 上滑到顶部：先吃掉内存里已有的更早消息，没有了再请求
    if (el.scrollTop < EDGE_TRIGGER && !pendingAnchorRef.current) {
      if (winStart > 0) {
        captureAnchor();
        setWinStart((s) => Math.max(0, s - PAGE_SIZE));
      } else if (hasMore) {
        void loadOlder();
      }
    } else if (dist < EDGE_TRIGGER && winStart + WINDOW_SIZE < all.length) {
      // 下滑到窗口底部但后面还有已加载的消息：把窗口往下挪一块
      captureAnchor();
      setWinStart((s) => Math.min(all.length - WINDOW_SIZE, s + PAGE_SIZE));
    }

    scheduleVisibleRepliesCheck();
  }, [
    all.length,
    captureAnchor,
    hasMore,
    loadOlder,
    scheduleVisibleRepliesCheck,
    winStart,
  ]);

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
        replyToId: replyTarget?.id ?? null,
      })
    );
    setInput("");
    setReplyTarget(null);
    focusInput();
  }

  function selectMention(target: "gentle" | "snarky") {
    if (mentionAt === null) return;
    const mention = target === "gentle" ? "@温柔宝" : "@嘴欠宝";
    const insertAt = mentionAt;
    setInput((prev) => {
      if (prev[insertAt] !== "@") return prev;
      return prev.slice(0, insertAt) + mention + " " + prev.slice(insertAt + 1);
    });
    setMentionAt(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(insertAt + mention.length + 1, insertAt + mention.length + 1);
    });
  }

  const showMention = mentionAt !== null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={openChat}
            aria-label="打开聊天室"
            data-tour="chatroom-entry"
            className="relative flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_color-mix(in_srgb,var(--theme-primary)_45%,transparent)] transition-all hover:scale-105 hover:brightness-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          />
        }>
          <ChatsCircle className="size-4" weight="fill" />
          {/* 深色小圆点提示有新消息（配白晕，在主题色填充底上区分开），不显示条数 */}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary-foreground shadow-[0_0_0_2px_rgba(255,255,255,0.7)]" />
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
              <div className="relative min-h-0 flex-1">
                {/* 加载更早历史的提示。浮层定位不占布局——否则它自己出现/消失就会把内容顶一下 */}
                {loadingOlder && messages.length > 0 && (
                  <div className="pointer-events-none absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    <span className="size-3 animate-spin rounded-full border-2 border-primary/70 border-t-transparent" />
                    加载更早的消息…
                  </div>
                )}
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
                  <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="thin-scrollbar h-full overflow-y-auto px-3 py-4 sm:px-5"
                  >
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
                        const isMine = m.userId !== null && m.userId === myId;
                        // 对「我」的引用回复（用于滚动感知标记已读）
                        const isReplyToMe =
                          m.replyTo?.userId != null &&
                          m.replyTo.userId === myId &&
                          m.userId !== myId;
                        return (
                          <MessageRow
                            key={m.id}
                            message={m}
                            isMine={isMine}
                            grouped={Boolean(sameSender && !tooFarApart)}
                            isFirst={i === 0}
                            replyToMe={isReplyToMe}
                            onReply={() => {
                              setReplyTarget({
                                id: m.id,
                                userId: m.userId,
                                userName: m.userName,
                                content: m.content,
                              });
                              focusInput();
                            }}
                            onJumpTo={scrollToMessage}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
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
                  <div className="rounded-2xl border border-border bg-foreground/[0.04] px-2.5 py-2 transition-colors focus-within:border-primary/40">
                    {/* 正在回复的目标消息引用条 */}
                    {replyTarget && (
                      <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-2.5 py-1.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <ArrowBendUpLeft className="size-3.5" weight="fill" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold text-primary">
                            引用 {replyTarget.userName ?? "用户"}
                          </span>
                          <p className="truncate text-[11px] leading-snug text-muted-foreground/80">
                            {replyTarget.content}
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger render={
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(null);
                                focusInput();
                              }}
                              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                              aria-label="取消回复"
                            />
                          }>
                            <X className="size-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>取消回复</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => {
                        const value = e.target.value;
                        setInput(value);
                        setMentionAt(findActiveMention(value, e.target.selectionStart ?? value.length));
                      }}
                      onSelect={(e) =>
                        setMentionAt(
                          findActiveMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                        )
                      }
                      onKeyDown={(e) => {
                        if (mentionAt !== null) {
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
              </div>
            </section>

            {/* 不在底部时一键返回：有未读显示条数，没有未读显示“回到底部” */}
            {!atBottom && (
              <button
                type="button"
                onClick={() => {
                  setAtBottom(true);
                  setNewCount(0);
                  // 「底部」指最新消息，不只是当前窗口的底：上滑翻过历史后窗口停在旧位置，
                  // 得先把它挪回末尾，否则只是滚到窗口底部、看到的仍不是最新那几条
                  if (!atTail) {
                    setWinStart(Math.max(0, all.length - WINDOW_SIZE));
                    requestAnimationFrame(() => scrollToBottom());
                  } else {
                    scrollToBottom("smooth");
                  }
                }}
                className="absolute bottom-18 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105"
              >
                {newCount > 0 ? (
                  <>{newCount} 条新消息</>
                ) : (
                  <>
                    <ArrowDown className="size-3.5" weight="bold" />
                    回到底部
                  </>
                )}
              </button>
            )}

            {/* 被回复提醒：待看到的那条回复消息进入可视区后自动消失；点击定位到该消息 */}
            {latestReply && (
              <button
                type="button"
                onClick={() => {
                  markSeen([latestReply.id]);
                  scrollToMessage(latestReply.id);
                }}
                className="absolute bottom-36 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105"
              >
                <ArrowBendUpLeft className="size-3.5" weight="fill" />
                {latestReply.userName ?? "有人"} 回复了你
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

/**
 * 单条消息行。
 *
 * 导出是为了让 scripts/bench-render.tsx 能拿**真实**的消息行做渲染基准
 * （虚拟化前后的 DOM 节点数与耗时对比），不是在别处复用这个组件。
 */
export function MessageRow({
  message,
  isMine,
  grouped,
  isFirst,
  replyToMe,
  onReply,
  onJumpTo,
}: {
  message: ChatMessage;
  isMine: boolean;
  grouped: boolean;
  isFirst: boolean;
  /** 是否是对「我」的引用回复（用于滚动感知标记已读） */
  replyToMe?: boolean;
  /** 点「回复」：进入引用回复状态 */
  onReply: (m: ChatMessage) => void;
  /** 点被引用预览条：定位到原消息 */
  onJumpTo: (id: string) => void;
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
      data-mid={message.id}
      data-reply-to-me={replyToMe ? "true" : undefined}
      className={cn(
        "group relative flex items-start gap-2.5",
        isMine ? "flex-row-reverse" : "flex-row",
        // 消息间距走 padding 而不是 margin：虚拟列表按元素高度测量，
        // margin 会被“漏”在测量之外，导致滚动位置估算偏移
        isFirst ? "" : grouped ? "pt-1" : "pt-5"
      )}
    >
      {/* 头像 */}
      {isAI ? (
        <Tooltip>
          <TooltipTrigger render={
            <div
              aria-hidden="true"
              className={cn(
                "relative flex self-start size-8 shrink-0 items-center justify-center",
                "rounded-full mt-1",
                isGentle
                  ? "bg-pink-200 ring-1 ring-pink-200/60 shadow-[0_0_0_1px_rgba(255,255,255,0.5)_inset,0_4px_14px_rgba(0,0,0,0.16),0_0_14px_rgba(244,114,182,0.3)] text-pink-900"
                  : "bg-primary ring-1 ring-primary/40 shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_4px_14px_rgba(0,0,0,0.22),0_0_14px_color-mix(in_oklab,var(--color-primary)_35%,transparent)] text-[color:color-mix(in_oklab,var(--color-primary-foreground)_55%,white)]"
              )}
            />
          }>
            <Sparkle className="size-[20px]" weight="fill" />
          </TooltipTrigger>
          <TooltipContent>{isGentle ? "温柔宝" : "嘴欠宝"}</TooltipContent>
        </Tooltip>
      ) : (
        <AppAvatar
          image={message.image}
          name={message.userName ?? "用户"}
          size="sm"
          className="size-8"
        />
      )}

      {/* 内容列 */}
      <div
        className={cn(
          "flex min-w-0 max-w-[78%] flex-col",
          isMine && "items-end"
        )}
      >
        {/* 名字 + 时间 */}
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

        {/* 气泡 + 回复按钮（inline 并排）。
            max-w-full 是必须的：外层内容列在「自己发的」消息上有 items-end，
            那会覆盖默认的 align-items: stretch，使这一行按内容撑开而不是撑满列宽。
            一串不可断的长内容（数字 / 英文 / URL）内容宽度可以远超列宽，于是气泡被撑到
            比列还宽、再向右对齐，溢出部分全往左跑（截图里被对话框左边缘截断的那种）。
            注意 overflow-wrap: break-word 救不了这个：按规范它不改变 min-content 宽度，
            只有先把行盒约束住它才会断词。 */}
        <div
          className={cn(
            "flex max-w-full items-center gap-1.5",
            isMine ? "flex-row-reverse" : "flex-row"
          )}
        >
          {/* 气泡 */}
          <div
            data-bubble={isAI ? "ai" : isMine ? "user" : "other"}
            className={cn(
              "min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
              isAI
                ? "rounded-bl-sm bg-foreground/[0.06] text-foreground/90 ring-1 ring-foreground/[0.06]"
                : isMine
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-foreground/[0.08] text-foreground/90"
            )}
          >
            {/* 被引用消息预览：外框包住内框，引用条作为独立内框嵌在气泡里 */}
            {message.replyTo && (
              <button
                type="button"
                onClick={() => onJumpTo(message.replyTo!.id)}
                className={cn(
                  "mb-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  isMine
                    ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/[0.14]"
                    : "border-primary/20 bg-primary/[0.06] hover:bg-primary/[0.1]"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    isMine
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  <ArrowBendUpLeft className="size-3" weight="fill" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[11px] font-semibold",
                      isMine ? "text-primary-foreground/90" : "text-primary"
                    )}
                  >
                    引用 {message.replyTo.userName ?? "用户"}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-[11px] leading-snug",
                      isMine ? "text-primary-foreground/60" : "text-foreground/60"
                    )}
                  >
                    {message.replyTo.content}
                  </span>
                </span>
              </button>
            )}

            <div>
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

          {/* 回复按钮：桌面 hover 显现，移动端常驻，避免太隐晦 */}
          <Tooltip>
            <TooltipTrigger render={
              <button
                type="button"
                onClick={() => onReply(message)}
                aria-label="回复"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  "border border-border/80 bg-background/85 text-muted-foreground/70 shadow-sm backdrop-blur",
                  "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                  "transition-all duration-150 hover:border-primary/25 hover:bg-primary/10 hover:text-primary",
                  "focus-visible:ring-1 focus-visible:ring-primary/40"
                )}
              />
            }>
              <ArrowBendUpLeft className="size-4" weight="fill" />
            </TooltipTrigger>
            <TooltipContent>回复</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
