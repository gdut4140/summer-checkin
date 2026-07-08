"use server";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPlan(formData: FormData) {
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
}

export async function updatePlan(planId: string, formData: FormData) {
  const user = await requireAuth();
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.userId !== user.id) throw new Error("Not authorized");

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
}

export async function deletePlan(planId: string) {
  const user = await requireAuth();
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.userId !== user.id) throw new Error("Not authorized");

  await prisma.plan.delete({ where: { id: planId } });
  revalidatePath("/plans");
  return { success: true };
}
