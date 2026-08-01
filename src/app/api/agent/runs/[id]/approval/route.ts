import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { decideAgentApproval, serializeAgentRun } from "@/lib/agent";

const decisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid decision" },
        { status: 400 }
      );
    }

    const run = await decideAgentApproval(
      user.id,
      id,
      parsed.data.approvalId,
      parsed.data.decision,
      parsed.data.reason
    );
    if (!run) return NextResponse.json({ error: "Agent run not found" }, { status: 404 });

    return NextResponse.json({ run: serializeAgentRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decide approval";
    const status = message.includes("no longer pending") ? 409 : 500;
    console.error("Agent approval error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

