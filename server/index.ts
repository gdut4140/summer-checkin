// ============================================================
// WebSocket sidecar 入口（方案 B：独立进程，监听 3001）
// 职责：实时多人聊天 + @AI 流式回复
// 启动：tsx server/index.ts
// ============================================================

import "./env";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config";
import { authenticate, type AuthUser } from "./auth";
import { prisma } from "./db";
import {
  addConnection,
  removeConnection,
  joinRoom,
  leaveRoom,
  broadcast,
  roomOnline,
  allConnections,
  type Connection,
} from "./room";
import { toDTO, type ClientMessage } from "./protocol";
import { handleAI } from "./ai";

// ---- HTTP 服务（仅用于健康检查 + WS 升级） ----
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

// ---- 升级阶段鉴权（在握手前拒绝未登录连接） ----
server.on("upgrade", (req, socket, head) => {
  console.log(`[ws] upgrade: path=${req.url} cookie=${req.headers.cookie ? "有" : "无"}`);
  authenticate(req.headers.cookie)
    .then((user) => {
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        setupConnection(ws, user);
      });
    })
    .catch((err) => {
      console.error("[ws] upgrade 异常:", err);
      socket.destroy();
    });
});

function setupConnection(ws: WebSocket, user: NonNullable<AuthUser>) {
  const conn: Connection = {
    ws,
    userId: user.id,
    userName: user.name ?? "匿名",
    image: user.image ?? null,
    rooms: new Set(),
    isAlive: true,
    windowStart: Date.now(),
    messageCount: 0,
    seenClientIds: new Set(),
  };
  addConnection(conn);

  ws.send(
    JSON.stringify({
      type: "ready",
      user: { id: user.id, name: user.name, image: user.image ?? null },
    })
  );

  ws.on("pong", () => {
    conn.isAlive = true;
  });

  ws.on("message", (data) => {
    void handleRawMessage(conn, data);
  });

  ws.on("close", () => {
    const rooms = [...conn.rooms];
    removeConnection(conn);
    for (const roomId of rooms) {
      broadcast(roomId, { type: "presence", roomId, online: roomOnline(roomId) });
    }
  });

  ws.on("error", () => {
    /* 忽略，交给 close 处理 */
  });
}

// ---- 消息分发 ----
async function handleRawMessage(conn: Connection, data: WebSocket.RawData) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(rawDataToString(data)) as ClientMessage;
  } catch {
    sendError(conn, "invalid_json", "消息格式错误");
    return;
  }

  switch (msg.type) {
    case "ping":
      conn.ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "join":
      await handleJoin(conn, msg.roomId);
      break;
    case "leave":
      leaveRoom(conn, msg.roomId);
      conn.ws.send(JSON.stringify({ type: "left", roomId: msg.roomId }));
      break;
    case "message":
      await handleUserMessage(conn, msg);
      break;
    default:
      sendError(conn, "unknown_type", "未知消息类型");
  }
}

async function handleJoin(conn: Connection, roomId: string) {
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    sendError(conn, "room_not_found", "房间不存在");
    return;
  }
  // 自动加入（未加入则创建成员关系）
  await prisma.chatRoomMember.upsert({
    where: { roomId_userId: { roomId, userId: conn.userId } },
    update: {},
    create: { roomId, userId: conn.userId },
  });
  joinRoom(conn, roomId);
  conn.ws.send(JSON.stringify({ type: "joined", roomId }));
  broadcast(roomId, { type: "presence", roomId, online: roomOnline(roomId) });
}

async function handleUserMessage(
  conn: Connection,
  msg: { roomId: string; clientId: string; content: string }
) {
  const content = msg.content.trim();
  if (!content) return;
  if (content.length > config.maxMessageLength) {
    sendError(conn, "too_long", "消息过长");
    return;
  }
  if (!checkRateLimit(conn)) {
    sendError(conn, "rate_limited", "发送太频繁，稍后再试");
    return;
  }
  // 幂等去重
  if (conn.seenClientIds.has(msg.clientId)) return;
  conn.seenClientIds.add(msg.clientId);
  if (conn.seenClientIds.size > 200) {
    conn.seenClientIds.delete(conn.seenClientIds.values().next().value!);
  }
  // 必须先加入房间
  if (!conn.rooms.has(msg.roomId)) return;

  const saved = await prisma.chatMessage.create({
    data: { roomId: msg.roomId, userId: conn.userId, role: "user", content },
  });
  broadcast(msg.roomId, { type: "message", message: toDTO(saved, conn.userName) });

  // @AI 触发
  const aiPrompt = extractAIPrompt(content);
  if (aiPrompt) void handleAI(msg.roomId, aiPrompt, conn.userId);
}

function sendError(conn: Connection, code: string, reason: string) {
  conn.ws.send(JSON.stringify({ type: "error", code, reason }));
}

function checkRateLimit(conn: Connection): boolean {
  const now = Date.now();
  if (now - conn.windowStart > config.rateLimit.windowMs) {
    conn.windowStart = now;
    conn.messageCount = 0;
  }
  conn.messageCount++;
  return conn.messageCount <= config.rateLimit.max;
}

function extractAIPrompt(content: string): string | null {
  const m = content.match(/^@雨宝\s+|^@AI\s+|^\/ai\s+/i);
  if (m) return content.slice(m[0].length).trim();
  return null;
}

function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return new TextDecoder().decode(data as ArrayBuffer);
}

// ---- 心跳：清理死连接 ----
const heartbeat = setInterval(() => {
  for (const c of allConnections()) {
    if (!c.isAlive) {
      c.ws.terminate();
      continue;
    }
    c.isAlive = false;
    c.ws.ping();
  }
}, config.heartbeatIntervalMs);

// ---- 优雅关闭 ----
function shutdown() {
  console.log("[ws] 优雅关闭中…");
  clearInterval(heartbeat);
  for (const c of allConnections()) {
    c.ws.close(1001, "Server shutting down");
  }
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(config.port, config.host, () => {
  console.log(`[ws] WebSocket 服务已启动 :${config.port}`);
});
