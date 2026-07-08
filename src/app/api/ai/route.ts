import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getAIResponse } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const messages = body.messages as {
      role: "user" | "assistant";
      content: string;
    }[];

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    const response = await getAIResponse(messages);

    // Save to history
    await prisma.aIHistory.create({
      data: {
        userId: user.id,
        message: lastMessage.content,
        response,
      },
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
