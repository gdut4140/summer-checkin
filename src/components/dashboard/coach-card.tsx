import Link from "next/link";
import { prisma } from "@/lib/prisma";

async function getLatestCoachMessage(userId: string) {
  const latestRun = await prisma.agentRun.findFirst({
    where: {
      userId,
      status: "completed",
      mode: { in: ["daily", "coach"] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      summary: true,
      updatedAt: true,
      steps: {
        orderBy: { stepNumber: "asc" },
        select: {
          kind: true,
          output: true,
        },
      },
    },
  });

  if (!latestRun?.summary) return null;

  // 取 analysis step 的 output 获取 status
  let status: string | null = null;
  for (const step of latestRun.steps) {
    if (
      step.kind === "analysis" &&
      step.output &&
      typeof step.output === "object"
    ) {
      status = (step.output as Record<string, unknown>).status as string | null;
    }
  }

  return {
    summary: latestRun.summary,
    status: status ?? "on_track",
    updatedAt: latestRun.updatedAt.toISOString(),
  };
}

const statusEmoji: Record<string, string> = {
  on_track: "✅",
  need_attention: "⚠️",
  need_adjustment: "🔧",
  at_risk: "🚨",
};

export async function CoachCard({ userId }: { userId: string }) {
  const msg = await getLatestCoachMessage(userId);

  if (!msg) return null;

  return (
    <Link
      href="/agent"
      className="glass-panel rounded-2xl px-5 py-4 flex items-center gap-4 transition-all hover:scale-[1.005] hover:shadow-lg group"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg">
        🧠
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold">AI 教练</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.updatedAt).toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1">
          {statusEmoji[msg.status] ?? ""} {msg.summary}
        </p>
      </div>

      <span className="text-muted-foreground/40 text-lg transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
