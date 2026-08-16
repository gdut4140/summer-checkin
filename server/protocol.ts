// ============================================================
// 消息协议：客户端 ↔ 服务端 之间的类型化 JSON 消息
// 每条消息都是 { type, ...payload }，type 决定字段
// ============================================================

export type MessageRole = "user" | "assistant" | "system";

// ---- 客户端 → 服务端 ----
export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "leave"; roomId: string }
  | { type: "message"; roomId: string; clientId: string; content: string }
  | { type: "ping" };

// ---- 服务端 → 客户端 ----
export type ServerMessage =
  | { type: "ready"; user: { id: string; name: string; image: string | null } }
  | { type: "joined"; roomId: string }
  | { type: "left"; roomId: string }
  | { type: "message"; message: ChatMessageDTO }
  | { type: "ai:start"; roomId: string }
  | { type: "ai:delta"; roomId: string; content: string }
  | { type: "ai:done"; roomId: string; message: ChatMessageDTO }
  | { type: "presence"; roomId: string; online: number }
  | { type: "pong" }
  | { type: "error"; code: string; reason: string };

export interface ChatMessageDTO {
  id: string;
  roomId: string;
  userId: string | null;
  userName: string | null;
  role: MessageRole;
  content: string;
  createdAt: string;
}

// 将 DB 记录转为前端 DTO
export function toDTO(
  msg: { id: string; roomId: string; userId: string | null; role: string; content: string; createdAt: Date },
  userName: string | null
): ChatMessageDTO {
  const role: MessageRole =
    msg.role === "assistant" || msg.role === "system" ? (msg.role as MessageRole) : "user";
  return {
    id: msg.id,
    roomId: msg.roomId,
    userId: msg.userId,
    userName,
    role,
    content: msg.content,
    createdAt: msg.createdAt.toISOString(),
  };
}
