// 内存连接管理（单实例起步，多实例再换 Redis/Postgres NOTIFY）
// 单房间模式：聊天是全局一条流，所有在线连接共享同一个频道

import type { WebSocket } from "ws";

export interface Connection {
  ws: WebSocket;
  userId: string;
  userName: string;
  image: string | null;
  isAlive: boolean;
  // 限流
  windowStart: number;
  messageCount: number;
  // 幂等去重（记录最近处理过的 clientId）
  seenClientIds: Set<string>;
}

const connections = new Set<Connection>();

export function addConnection(c: Connection) {
  connections.add(c);
}

export function removeConnection(c: Connection) {
  connections.delete(c);
}

// 全局广播给所有在线连接
export function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  for (const c of connections) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
}

export function allConnections() {
  return connections;
}
