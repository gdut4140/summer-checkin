"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MessageBubble } from "@/components/ai/message-bubble";
import { PaperPlaneTilt, Spinner } from "@phosphor-icons/react";
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
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 切换到某个对话
  async function switchConversation(id: string) {
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
  }

  // 创建新对话
  async function newConversation() {
    setMessages([]);
    setActiveId(null);
    // 刷新对话列表
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  }

  // 删除对话
  async function deleteConversation(id: string) {
    const res = await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setMessages([]);
      setActiveId(null);
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

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          conversationId: activeId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "获取回复失败");
      }

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      // 新对话时更新 activeId 和列表
      if (!activeId && data.conversationId) {
        setActiveId(data.conversationId);
        const listRes = await fetch("/api/conversations");
        if (listRes.ok) {
          const listData = await listRes.json();
          setConversations(listData.conversations);
        }
      } else {
        // 刷新对话列表以更新排序
        const listRes = await fetch("/api/conversations");
        if (listRes.ok) {
          const listData = await listRes.json();
          setConversations(listData.conversations);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 回复失败");
    } finally {
      setLoading(false);
    }
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
      <div className="w-56 flex-shrink-0 hidden md:flex flex-col gap-1">
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
            {loading && (
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
                className="resize-none min-h-[44px]"
                disabled={loading}
              />
              <Button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                size="icon"
                className="h-[44px] w-[44px] flex-shrink-0"
              >
                <PaperPlaneTilt className="h-5 w-5" weight="fill" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
