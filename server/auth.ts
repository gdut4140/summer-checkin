// 会话鉴权：复用 Better Auth 官方 API 解签 cookie（cookie 里的 token 是签名过的）
// 不能直接查 Session.token，必须走 auth.api.getSession

import { auth } from "@/lib/auth";

export async function authenticate(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  try {
    const headers = new Headers({ cookie: cookieHeader });
    const result = await auth.api.getSession({ headers });
    if (!result) {
      console.warn("[ws] 鉴权失败：session 无效");
      return null;
    }
    console.log(`[ws] 鉴权通过 user=${result.user.id}`);
    return result.user;
  } catch (err) {
    console.error("[ws] 鉴权查询出错:", err);
    return null;
  }
}

export type AuthUser = Awaited<ReturnType<typeof authenticate>>;
