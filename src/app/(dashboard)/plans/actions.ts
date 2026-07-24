"use server";

// ============================================================
// Day 10 优化：统一 Server Action 错误处理
// 不再 throw，改为返回 ActionResult<T> 让调用方统一处理
// ============================================================

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export async function createPlan(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const goal = (formData.get("goal") as string) || null;
    const targetHours = parseFloat(formData.get("targetHours") as string) || 0;
    const startDate = formData.get("startDate")
      ? new Date(formData.get("startDate") as string)
      : null;
    const endDate = formData.get("endDate")
      ? new Date(formData.get("endDate") as string)
      : null;

    await prisma.plan.create({
      data: { userId: user.id, name, description, goal, targetHours, startDate, endDate },
    });

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
    const targetHours = parseFloat(formData.get("targetHours") as string) || 0;
    const startDate = formData.get("startDate")
      ? new Date(formData.get("startDate") as string)
      : null;
    const endDate = formData.get("endDate")
      ? new Date(formData.get("endDate") as string)
      : null;

    await prisma.plan.update({
      where: { id: planId },
      data: { name, description, goal, targetHours, startDate, endDate },
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
