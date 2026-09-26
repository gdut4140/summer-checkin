// ============================================================
// WebSocket 握手的路径 + Origin 校验
//
// 聊天室用 cookie 鉴权，而浏览器会自动给目标站点带上 cookie。所以
// 「这条连接是谁发起的」必须单独判断，否则第三方站点可以借用户的
// cookie 连上聊天室 —— 这就是 CSWSH（跨站 WebSocket 劫持）。
//
// 注意这道校验目前的定位是**第二层防线**：会话 cookie 是 SameSite=Lax
// （better-auth 默认值，见 src/lib/auth.ts），跨站的 WebSocket 握手本来
// 就不带 cookie。但两件事会让它变成唯一的那层：
//   1. cookie 被改成 SameSite=None
//   2. 迁到有兄弟子域的域名 —— SameSite 比的是「站点」(eTLD+1) 不是「源」，
//      evil.example.com → app.example.com 算同站，Lax 拦不住
// ============================================================

/** 本地开发时前端可能跑在这几个端口（仅非生产环境放行） */
const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
] as const;

/** 把任意 URL 归一成 origin；不合法返回 null */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * 允许握手的 Origin 集合。
 *
 * 生产环境只认 BETTER_AUTH_URL（部署时 = 公网访问地址，不带端口）；
 * 非生产额外放行本机端口，方便 `npm run dev` + `npm run ws:dev`。
 */
export function allowedOrigins(
  applicationUrl = process.env.BETTER_AUTH_URL,
  isProduction = process.env.NODE_ENV === "production"
): Set<string> {
  const origins = new Set<string>(isProduction ? [] : DEV_ORIGINS);
  const configured = applicationUrl ? normalizeOrigin(applicationUrl) : null;
  if (configured) origins.add(configured);
  return origins;
}

/**
 * 这条握手该不该放行。
 *
 * - 只接受 `/ws` 路径
 * - 必须带 Origin 且落在允许集合里（缺失即拒绝，fail-closed）
 */
export function isAllowedUpgrade(
  requestUrl: string | undefined,
  origin: string | undefined,
  allowed: Set<string>
): boolean {
  if (!requestUrl) return false;

  // 路径必须恰好是 /ws：nginx 的 `location /ws` 是前缀匹配，
  // 而 sidecar 本身从不看路径，两者叠加会让 /ws/anything 也连得进来。
  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://ws.internal").pathname;
  } catch {
    return false;
  }
  if (pathname !== "/ws") return false;

  // 浏览器发起的握手一定带 Origin —— 缺了就拒。脚本客户端能伪造这个头，
  // 但伪造者本来就得先持有有效 cookie，所以这里防的是跨站，不是防盗用。
  const normalized = origin ? normalizeOrigin(origin) : null;
  return normalized !== null && allowed.has(normalized);
}
