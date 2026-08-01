import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { cancelAgentRun, serializeAgentRun } from "@/lib/agent";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const run = await cancelAgentRun(user.id, id);
    if (!run) return NextResponse.json({ error: "Agent run not found" }, { status: 404 });
    return NextResponse.json({ run: serializeAgentRun(run) });
  } catch (error) {
    console.error("Cancel agent run error:", error);
    return NextResponse.json({ error: "Failed to cancel agent run" }, { status: 500 });
  }
}

