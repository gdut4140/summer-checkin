// ============================================================
// WebSocket sidecar 入口（方案 B：独立进程，监听 3001）
// 职责：实时聊天（单房间全局流）+ @AI 流式回复
// 启动：tsx server/index.ts
// ============================================================

import "./env";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config";
import { authenticate, type AuthUser } from "./auth";
import { prisma } from "./db";
import { addConnection, removeConnection, broadcast, allConnections, type Connection } from "./room";
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
    isAlive: true,
    windowStart: Date.now(),
    messageCount: 0,
    seenClientIds: new Set(),
  };
  addConnection(conn);
  // 通知所有在线连接：在线人数变化
  broadcast({ type: "presence", online: allConnections().size });

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
    removeConnection(conn);
    broadcast({ type: "presence", online: allConnections().size });
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
    case "message":
      await handleUserMessage(conn, msg);
      break;
    default:
      sendError(conn, "unknown_type", "未知消息类型");
  }
}

async function handleUserMessage(conn: Connection, msg: { clientId: string; content: string }) {
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

  const saved = await prisma.chatMessage.create({
    data: { userId: conn.userId, role: "user", content },
  });
  // 用数据库里的最新昵称/头像（用户可能中途换了头像，conn 里是连接时的旧值）
  const sender = await prisma.user.findUnique({
    where: { id: conn.userId },
    select: { name: true, image: true },
  });
  const userName = sender?.name ?? conn.userName;
  const image = sender?.image ?? conn.image;
  conn.userName = userName;
  conn.image = image;

  console.log(
    `[ws][消息] ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${userName}: ${content.length > 100 ? content.slice(0, 100) + "…" : content}`
  );

  broadcast({ type: "message", message: toDTO(saved, userName, image) });

  // @AI 触发
  const aiPrompt = extractAIPrompt(content);
  if (aiPrompt) void handleAI(aiPrompt);
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
  // @雨宝 / @AI 可在文中任意位置触发；/ai 是命令式，仍要求开头（避免命中 /api 之类）
  const m = content.match(/@雨宝|@AI|^\s*\/ai(?=\s|$)/i);
  if (!m) return null;
  const idx = m.index!;
  // 优先取提及之后的文字作为提问
  const after = content.slice(idx + m[0].length).replace(/^\s+/, "").trim();
  if (after) return after;
  // 提及在末尾、后面没内容：把提及之前的文字作为提问
  const before = content.slice(0, idx).trim();
  return before || null;
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
