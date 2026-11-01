// ============================================================
// Scene Context：当前业务数据
//
// 每次请求按 Conversation.surface + refId 重新查询，并校验 userId 归属。
// 不把完整业务数据复制进 AgentState。
// ============================================================

import { prisma } from "@/lib/prisma";
import type { MemorySurface } from "@/lib/memory/types";

export interface SceneContext {
  prompt: string;
  planName?: string;
  documentTitle?: string;
}

export async function loadSceneContext(input: {
  userId: string;
  surface: MemorySurface;
  refId: string | null;
  /** 工作台编辑器的当前内容；有则优先于数据库内容 */
  clientDocument?: string | null;
}): Promise<SceneContext> {
  if (!input.refId || input.surface === "agent") {
    return { prompt: "" };
  }

  if (input.surface === "plan") {
    const plan = await prisma.plan.findFirst({
      where: { id: input.refId, userId: input.userId },
      select: { id: true, name: true, document: true },
    });
    if (!plan) return { prompt: "" };

    const document = input.clientDocument ?? plan.document ?? "";
    return {
      planName: plan.name,
      prompt: [
        `用户正在文档工作室里编辑学习计划「${plan.name}」的 Markdown 文档，完整内容如下：`,
        "",
        document,
        "",
        "你可以调用工具直接修改它：调整计划信息用 updatePlanInfo；修改文档内容用 updateDocument（必须传完整的修改后文档）。",
        "涉及任务时，请同步修改文档中「## 任务安排」段落的任务行。",
      ].join("\n"),
    };
  }

  const document = await prisma.document.findFirst({
    where: { id: input.refId, userId: input.userId },
    select: { id: true, title: true, content: true },
  });
  if (!document) return { prompt: "" };

  const content = input.clientDocument ?? document.content ?? "";
  return {
    documentTitle: document.title,
    prompt: [
      `用户正在文档工作室里编辑文档「${document.title}」的 Markdown 内容，完整内容如下：`,
      "",
      content,
      "",
      "你可以用 updateDocument 工具直接修改这份文档（必须传完整的修改后文档）。",
    ].join("\n"),
  };
}
