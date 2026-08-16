// WebSocket sidecar 运行配置

export const config = {
  port: parseInt(process.env.WS_PORT ?? "3001", 10),
  host: "0.0.0.0",

  // 心跳：服务端定期 ping，客户端 pong，超时未响应则断开
  heartbeatIntervalMs: 30_000,

  // 消息长度上限（字符）
  maxMessageLength: 2000,

  // 限流：每个连接在窗口内的最大消息数（防刷屏）
  rateLimit: {
    windowMs: 60_000,
    max: 30,
  },

  // AI 上下文：取最近 N 条房间消息
  aiContextMessages: 20,
} as const;

export const SESSION_COOKIE_NAME = "better-auth.session_token";
