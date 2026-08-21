"use server";

// ============================================================
// Day 10 优化：统一 Server Action 错误处理
// 不再 throw，改为返回 ActionResult<T> 让调用方统一处理
// ============================================================

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import { syncTasksFromDocument } from "@/lib/studio/plan-sync";

/** 新计划的默认模板文档：带「## 任务安排」，同步成任务清单，避免一开始是空的 */
function defaultPlanDocument(name: string, goal?: string | null): string {
  return [
    `# ${name}`,
    "",
    "## 目标",
    goal || "（写下这个计划最终要达成的结果，越具体越好）",
    "",
    "## 计划说明",
    "（整体安排、时间节奏）",
    "",
    "## 学习指导",
    "（分阶段展开：每个阶段学什么、怎么学、推荐资源、完成标准）",
    "",
    "## 任务安排",
    "- [ ] 明确目标：写下这个计划最终要达成的结果",
    "- [ ] 收集资料：整理官方文档、教程与参考资源",
    "- [ ] 学习核心知识：搭建整体框架",
    "- [ ] 动手实践：完成练习或一个小项目",
    "- [ ] 复习巩固并复盘：记录收获与待补强点",
  ].join("\n");
}

/** 新建一个空白计划并返回 planId（前端随即跳进 studio，AI 框聚焦，引导用户直接在 AI 里生成内容） */
export async function createBlankPlan(): Promise<ActionResult<{ planId: string }>> {
  try {
    const user = await requireAuth();
    const doc = defaultPlanDocument("未命名计划");
    const plan = await prisma.plan.create({
      data: { userId: user.id, name: "未命名计划", document: doc },
    });
    await syncTasksFromDocument(plan.id, user.id, doc);
    return { success: true, data: { planId: plan.id } };
  } catch (error) {
    console.error("[createBlankPlan] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "创建计划失败，请稍后重试",
    };
  }
}

export async function createPlan(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const goal = (formData.get("goal") as string) || null;
    const startDate = formData.get("startDate")
      ? new Date(formData.get("startDate") as string)
      : null;

    const doc = defaultPlanDocument(name, goal);
    const plan = await prisma.plan.create({
      data: { userId: user.id, name, description, goal, startDate, document: doc },
    });
    await syncTasksFromDocument(plan.id, user.id, doc);

    revalidatePath("/plans");
    return { success: true };
  } catch (error) {
    console.error("[createPlan] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "创建计划失败，请稍后重试",
    };
  }
}

export async function updatePlan(planId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.userId !== user.id) {
      return { success: false, error: "无权限操作此计划" };
    }

    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const goal = (formData.get("goal") as string) || null;
    const startDate = formData.get("startDate")
      ? new Date(formData.get("startDate") as string)
      : null;

    await prisma.plan.update({
      where: { id: planId },
      data: { name, description, goal, startDate },
    });

    revalidatePath("/plans");
    return { success: true };
  } catch (error) {
    console.error("[updatePlan] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新计划失败，请稍后重试",
    };
  }
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.userId !== user.id) {
      return { success: false, error: "无权限删除此计划" };
    }

    await prisma.plan.delete({ where: { id: planId } });
    revalidatePath("/plans");
    return { success: true };
  } catch (error) {
    console.error("[deletePlan] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "删除计划失败，请稍后重试",
    };
  }
}
