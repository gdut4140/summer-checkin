// ============================================================
// Day 11: requireAuth() 强制鉴权 — 未登录用户自动跳转 /login
// ============================================================
import { requireAuth } from "@/lib/auth-utils";
import { TopNav } from "@/components/layout/top-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Day 11: requireAuth() 内部调用 getCurrentUser() + 鉴权重定向
  // 未登录 → redirect("/login")，已登录 → 返回 user
  const user = await requireAuth();

  return (
    <div className="scenic-shell relative flex min-h-[100dvh] flex-col">
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
