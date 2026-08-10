"use server";

// ============================================================
// Day 10 优化：统一 Server Action 错误处理
// 不再 throw，改为返回 ActionResult<T> 让调用方统一处理
// ============================================================

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/types";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const name = formData.get("name") as string;
    const bio = (formData.get("bio") as string) || null;

    await prisma.user.update({
      where: { id: user.id },
      data: { name, bio },
    });

    revalidatePath("/settings");
    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[updateProfile] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新资料失败，请稍后重试",
    };
  }
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  try {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    await auth.api.changePassword({
      headers: await headers(),
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    });

    // 密码修改后登出当前会话
    await auth.api.signOut({ headers: await headers() });

    return { success: true };
  } catch (error) {
    console.error("[changePassword] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "修改密码失败，请稍后重试",
    };
  }
}
