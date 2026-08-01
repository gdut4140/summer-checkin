import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import {
  createAgentRun,
  listAgentRuns,
  serializeAgentRun,
} from "@/lib/agent";

const createRunSchema = z.object({
  goal: z.string().trim().min(3, "目标至少需要 3 个字").max(1000),
  mode: z.enum(["planner", "coach", "review"]).default("planner"),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const runs = await listAgentRuns(user.id);
    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        mode: run.mode,
        goal: run.goal,
        status: run.status,
        currentStep: run.currentStep,
        summary: run.summary,
        error: run.error,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        latestStep: run.steps[0]
          ? {
              title: run.steps[0].title,
              status: run.steps[0].status,
              detail: run.steps[0].detail,
            }
          : null,
        pendingApproval: run.approvals.find((approval) => approval.status === "pending")
          ? { id: run.approvals.find((approval) => approval.status === "pending")?.id }
          : null,
      })),
    });
  } catch (error) {
    console.error("List agent runs error:", error);
    return NextResponse.json({ error: "Failed to list agent runs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = createRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const run = await createAgentRun(user.id, parsed.data.goal, parsed.data.mode);
    if (!run) return NextResponse.json({ error: "Failed to create run" }, { status: 500 });

    return NextResponse.json({ run: serializeAgentRun(run) }, { status: 201 });
  } catch (error) {
    console.error("Create agent run error:", error);
    return NextResponse.json({ error: "Failed to create agent run" }, { status: 500 });
  }
}

