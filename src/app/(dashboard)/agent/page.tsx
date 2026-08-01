import { requireAuth } from "@/lib/auth-utils";
import { listAgentRuns } from "@/lib/agent";
import { AgentWorkspace, type AgentRunListItem } from "@/components/agent/agent-workspace";

export default async function AgentPage() {
  const user = await requireAuth();
  const runs = await listAgentRuns(user.id);
  const initialRuns: AgentRunListItem[] = runs.map((run) => {
    const latestStep = run.steps[0];
    const pendingApproval = run.approvals.find((approval) => approval.status === "pending");
    return {
      id: run.id,
      mode: run.mode,
      goal: run.goal,
      status: run.status,
      currentStep: run.currentStep,
      summary: run.summary,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      latestStep: latestStep
        ? { title: latestStep.title, status: latestStep.status, detail: latestStep.detail }
        : null,
      pendingApproval: pendingApproval ? { id: pendingApproval.id } : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Agent 工作台</h1>
        <p className="mt-1 text-muted-foreground">把学习目标变成计划、任务和可以持续执行的下一步。</p>
      </div>
      <AgentWorkspace initialRuns={initialRuns} />
    </div>
  );
}

