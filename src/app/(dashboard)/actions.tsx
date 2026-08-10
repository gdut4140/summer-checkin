"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SignOut } from "@phosphor-icons/react";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await authClient.signOut();
    } catch {
      // session 可能已被其他标签页销毁，忽略错误
    }
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-red-400"
    >
      <SignOut className="h-4 w-4" />
      退出登录
    </button>
  );
}
