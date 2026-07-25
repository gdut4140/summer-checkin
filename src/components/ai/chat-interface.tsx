"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MessageBubble } from "@/components/ai/message-bubble";
import {
  PaperPlaneTilt,
  Spinner,
  Stop,
  Brain,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { ChatMessage } from "@/types";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: { role: string; content: string }[];
}

interface Props {
  initialMessages: ChatMessage[];
  conversations: Conversation[];
  activeConversationId: string | null;
}

export function ChatInterface({
  initialMessages,
  conversations: initialConversations,
  activeConversationId: initialActiveId,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);

  // 记录「进入对话时的消息数」，离开时对比这个数字判断是否有新消息
  const initialMsgCountRef = useRef<number>(initialMessages.length);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 当 activeId 变化（进入新对话）时，更新基准计数
  useEffect(() => {
    initialMsgCountRef.current = messages.length;
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 刷新对话列表 */
  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  }, []);

  /**
   * 离开当前对话时调用
   * 如果有新消息（消息数 > 进入时的消息数），则请求 AI 重新生成标题
   */
  async function beforeLeaveConversation() {
    if (!activeId) return;

    const currentCount = messages.length;
    // 没有新消息 → 跳过，不浪费 API 调用
    if (currentCount <= initialMsgCountRef.current) return;

    // 后台静默更新标题，不阻塞切换
    fetch(`/api/conversations/${activeId}/title`, {
      method: "PATCH",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.skipped) return; // AI 认为不需要更新
        // 更新侧边栏中的标题
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, title: data.title } : c
          )
        );
      })
      .catch(() => {
        // 标题更新失败不影响主流程，静默处理
      });
  }

  /** 切换到某个对话 */
  async function switchConversation(id: string) {
    if (id === activeId) return; // 点击的是当前对话，不触发

    // 离开当前对话前，检查是否需要更新标题
    await beforeLeaveConversation();

    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const msgs: ChatMessage[] = data.messages.map(
      (m: { id: string; role: string; content: string; createdAt: string }) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.createdAt),
      })
    );
    setMessages(msgs);
    setActiveId(id);
    initialMsgCountRef.current = msgs.length;
  }

  /** 创建新对话 */
  async function newConversation() {
    await beforeLeaveConversation();

    setMessages([]);
    setActiveId(null);
    initialMsgCountRef.current = 0;
    await refreshConversations();
  }

  /** 删除对话 */
  async function deleteConversation(id: string) {
    const res = await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setMessages([]);
      setActiveId(null);
      initialMsgCountRef.current = 0;
    }
    toast.success("对话已删除");
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    // 先添加用户消息 + AI 占位消息（流式更新内容）
    const aiMessageId = `ai-${Date.now()}`;
    const aiPlaceholder: ChatMessage = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
    setInput("");
    setLoading(true);

    try {
      // ============================================================
      // Day 12: 短期记忆 — 限制上下文窗口
      // 只发送最近 20 轮（40 条消息），避免 token 爆炸
      // ============================================================
      const MAX_CONTEXT_ROUNDS = 20;
      const MAX_CONTEXT_MESSAGES = MAX_CONTEXT_ROUNDS * 2;

      const allMessages = [...messages, userMessage];
      const recentMessages = allMessages.slice(-MAX_CONTEXT_MESSAGES);

      const apiMessages = recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const truncated = allMessages.length - recentMessages.length;
      if (truncated > 0) {
        console.log(
          `[Chat] 上下文窗口截断: ${allMessages.length} → ${recentMessages.length} 条 (${truncated} 条旧消息省略)`
        );
      }

      // ============================================================
      // Day 3 核心：前端流式读取
      // ① res.body.getReader() 获取 ReadableStream reader
      // ② 循环 read() 拿到 Uint8Array chunks
      // ③ TextDecoder 解码，逐步追加到 AI 消息 content
      // ④ 流结束后从 header 取 conversationId
      // ============================================================
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          conversationId: activeId,
          deepThink,
        }),
      });

      if (!res.ok) {
        // 非流式错误响应（如 401, 400）
        const data = await res.json();
        throw new Error(data.error || "获取回复失败");
      }

      // 从响应 header 获取 conversationId（新对话时返回）
      const newConversationId = res.headers.get("X-Conversation-Id");

      // 读取流式响应体
      const reader = res.body?.getReader();
      if (!reader) throw new Error("浏览器不支持流式读取");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码当前 chunk 并追加到累积文本
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        // 实时更新 AI 消息内容
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, content: accumulated } : m
          )
        );
      }

      // 流结束后处理 conversationId
      if (!activeId && newConversationId) {
        setActiveId(newConversationId);
      }

      // 刷新对话列表（新对话出现、标题更新等）
      await refreshConversations();
    } catch (e) {
      // 流式读取中途失败，移除空的 AI 占位消息
      setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      toast.error(e instanceof Error ? e.message : "AI 回复失败");
    } finally {
      setLoading(false);
    }
  }

  /** Day 4: 停止生成（AbortController） */
  function handleStop() {
    // TODO: Day 10+ 实现真正的中断
    setLoading(false);
    toast.info("已停止生成");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100dvh-12rem)]">
      {/* 对话列表侧边栏 */}
      <div className="w-56 shrink-0 hidden md:flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={newConversation}
        >
          + 新建对话
        </Button>
        <div className="flex-1 overflow-y-auto space-y-1 mt-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                activeId === conv.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => switchConversation(conv.id)}
            >
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                title="删除对话"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 聊天主区域 */}
      <Card className="flex flex-col flex-1 min-w-0">
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          {/* Day 4: 聊天头部 - 显示消息数 */}
          {messages.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">
                {messages.length} 条消息
              </span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  你好！我是你的 AI 学习助手，可以帮你制定学习计划、总结学习内容、推荐学习资源，尽管问我！
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {loading &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "assistant" &&
              messages[messages.length - 1].content === "" && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Spinner className="h-4 w-4 animate-spin" />
                  思考中...
                </div>
              )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="向 AI 助手提问..."
                rows={2}
                className="resize-none min-h-11"
                disabled={loading}
              />
              {/* 深度思考开关 */}
              <Button
                variant={deepThink ? "default" : "outline"}
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => setDeepThink(!deepThink)}
                disabled={loading}
                title={deepThink ? "深度思考已开启" : "开启深度思考"}
              >
                <Brain
                  className={`h-5 w-5 ${deepThink ? "animate-pulse" : ""}`}
                  weight={deepThink ? "fill" : "regular"}
                />
              </Button>
              {/* Day 4: 根据状态显示发送或停止按钮 */}
              {loading ? (
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                >
                  <Stop className="h-5 w-5" weight="fill" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                >
                  <PaperPlaneTilt className="h-5 w-5" weight="fill" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
