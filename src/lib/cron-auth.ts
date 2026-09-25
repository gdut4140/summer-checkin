// ============================================================
// Cron 接口鉴权（fail-closed）
//
// 修复 #4：原逻辑 `if (expectedSecret && authHeader !== ...)` 在
// CRON_SECRET 未配置时短路跳过整段校验，导致接口可被匿名触发。
// 现在约定：secret 缺失 = 拒绝一切请求，而不是放行一切请求。
// ============================================================

/**
 * 校验 cron 请求是否携带有效凭据。
 *
 * - 未配置 `CRON_SECRET` → false（fail-closed，接口整体拒绝）
 * - 配置后必须携带完全一致的 `Bearer <secret>`
 */
export function isCronAuthorized(
  authHeader: string | null,
  expectedSecret: string | undefined | null
): boolean {
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}
