// ============================================================
// 消息协议：客户端 ↔ 服务端 之间的类型化 JSON 消息
// 每条消息都是 { type, ...payload }，type 决定字段
// 单房间模式：聊天是全局一条流，没有 roomId
// ============================================================

export type MessageRole = "user" | "assistant" | "system";

// ---- 客户端 → 服务端 ----
export type ClientMessage =
  | { type: "message"; clientId: string; content: string }
  | { type: "ping" };

// ---- 服务端 → 客户端 ----
export type ServerMessage =
  | { type: "ready"; user: { id: string; name: string; image: string | null } }
  | { type: "message"; message: ChatMessageDTO }
  | { type: "ai:start" }
  | { type: "ai:delta"; content: string }
  | { type: "ai:done"; message: ChatMessageDTO }
  | { type: "presence"; online: number }
  | { type: "pong" }
  | { type: "error"; code: string; reason: string };

export interface ChatMessageDTO {
  id: string;
  userId: string | null;
  userName: string | null;
  /** 发送者的头像（preset id 或 URL），AI 消息为 null */
  image: string | null;
  role: MessageRole;
  content: string;
  createdAt: string;
}

// 将 DB 记录转为前端 DTO
export function toDTO(
  msg: { id: string; userId: string | null; role: string; content: string; createdAt: Date },
  userName: string | null,
  image: string | null = null
): ChatMessageDTO {
  const role: MessageRole =
    msg.role === "assistant" || msg.role === "system" ? (msg.role as MessageRole) : "user";
  return {
    id: msg.id,
    userId: msg.userId,
    userName,
    image,
    role,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
  };
}
