// 内存连接/房间管理（单实例起步，多实例再换 Redis/Postgres NOTIFY）

import type { WebSocket } from "ws";

export interface Connection {
  ws: WebSocket;
  userId: string;
  userName: string;
  image: string | null;
  rooms: Set<string>;
  isAlive: boolean;
  // 限流
  windowStart: number;
  messageCount: number;
  // 幂等去重（记录最近处理过的 clientId）
  seenClientIds: Set<string>;
}

const connections = new Set<Connection>();
const rooms = new Map<string, Set<Connection>>();

export function addConnection(c: Connection) {
  connections.add(c);
}

export function removeConnection(c: Connection) {
  connections.delete(c);
  for (const roomId of c.rooms) {
    const set = rooms.get(roomId);
    if (set) {
      set.delete(c);
      if (set.size === 0) rooms.delete(roomId);
    }
  }
}

export function joinRoom(c: Connection, roomId: string) {
  c.rooms.add(roomId);
  let set = rooms.get(roomId);
  if (!set) {
    set = new Set();
    rooms.set(roomId, set);
  }
  set.add(c);
}

export function leaveRoom(c: Connection, roomId: string) {
  c.rooms.delete(roomId);
  const set = rooms.get(roomId);
  if (set) {
    set.delete(c);
    if (set.size === 0) rooms.delete(roomId);
  }
}

export function broadcast(roomId: string, message: unknown) {
  const set = rooms.get(roomId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const c of set) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
}

export function roomOnline(roomId: string): number {
  return rooms.get(roomId)?.size ?? 0;
}

export function allConnections() {
  return connections;
}
