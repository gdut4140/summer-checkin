// ============================================================
// Day 11: requireAuth() 强制鉴权 — 未登录用户自动跳转 /login
// ============================================================
import { requireAuth } from "@/lib/auth-utils";
import { TopNav } from "@/components/layout/top-nav";
import { DailyAgentCheck } from "@/components/dashboard/daily-agent-check";
import { AgentOrb } from "@/components/agent/agent-orb";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <div className="scenic-shell relative flex min-h-[100dvh] flex-col">
      <TopNav user={user} />
      <main className="relative flex flex-1 flex-col px-0 py-0">
        {children}
      </main>
      <DailyAgentCheck />
      <AgentOrb />
    </div>
  );
}
