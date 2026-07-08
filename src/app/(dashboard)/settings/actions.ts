"use server";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function updateProfile(formData: FormData) {
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
}

export async function changePassword(formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;

  await auth.api.changePassword({
    headers: await headers(),
    body: {
      currentPassword,
      newPassword,
    },
  });

  return { success: true };
}
