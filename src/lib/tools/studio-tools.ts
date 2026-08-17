// ============================================================
// 文档工作室 AI 工具（Phase 3/4）
// 作用对象：用户正在编辑的学习计划（Plan.document + PlanTask）
//           或通用文档（Document.content）
// 设计要点：
//   · update_document 让模型返回「完整的新文档」，由前端应用到编辑器
//     （进撤销栈，可 Ctrl+Z），后端只负责落库 +（计划）同步任务。
//   · 任务同步用保守策略：状态更新 + 新增，不删除（避免误删进度）。
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncTasksFromDocument } from "@/lib/studio/plan-sync";

export type StudioTarget = { kind: "plan" | "doc"; id: string };

export function createStudioTools(userId: string, target: StudioTarget) {
  const isPlan = target.kind === "plan";

  const updatePlanInfo = tool({
    description:
      "更新学习计划的基本信息（名称 / 目标 / 说明）。只传需要修改的字段。",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(120).optional(),
      goal: z.string().trim().max(600).optional(),
      description: z.string().trim().max(600).optional(),
    }),
    execute: async ({ name, goal, description }) => {
      const plan = await prisma.plan.findFirst({
        where: { id: target.id, userId },
      });
      if (!plan) return { success: false, error: "计划不存在" };

      await prisma.plan.update({
        where: { id: target.id },
        data: {
          ...(name ? { name } : {}),
          ...(goal !== undefined ? { goal } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
      return { success: true, updatedFields: { name, goal, description } };
    },
  });

  const updateDocument = tool({
    description:
      "替换当前文档的完整 Markdown 内容。必须传入修改后的完整文档（包含所有段落）。",
    inputSchema: z.object({
      content: z.string().min(1).max(100000),
    }),
    execute: async ({ content }) => {
      if (isPlan) {
        const plan = await prisma.plan.findFirst({
          where: { id: target.id, userId },
        });
        if (!plan) return { success: false, error: "计划不存在" };

        await prisma.plan.update({
          where: { id: target.id },
          data: { document: content },
        });

        // AI 修改文档后，把「## 任务安排」段落同步回 PlanTask（勾选状态 + 新增任务，不删除）
        await syncTasksFromDocument(target.id, userId, content).catch((err) =>
          console.error("[updateDocument] 任务同步失败:", err)
        );

        return { success: true };
      }

      const doc = await prisma.document.findFirst({
        where: { id: target.id, userId },
      });
      if (!doc) return { success: false, error: "文档不存在" };

      await prisma.document.update({
        where: { id: target.id },
        data: { content },
      });
      return { success: true };
    },
  });

  return isPlan
    ? { updatePlanInfo, updateDocument }
    : { updateDocument };
}
