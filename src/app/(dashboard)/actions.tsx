"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Power } from "@phosphor-icons/react";

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
      aria-label="退出登录"
      className="group relative my-2 mx-auto flex h-[40px] w-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary shadow-sm transition-colors duration-200 hover:bg-primary/90 focus:outline-none"
    >
      <span className="font-bold text-primary-foreground transition-colors duration-200 group-hover:text-transparent">
        退出登录
      </span>
      <span className="absolute inset-y-0 right-0 flex h-full w-10 items-center justify-center border-l border-primary-foreground/20 transition-all duration-200 group-hover:left-0 group-hover:w-full group-hover:border-l-0">
        <Power
          weight="fill"
          className="h-[15px] w-[15px] text-primary-foreground transition-transform duration-200 group-active:scale-90"
        />
      </span>
    </button>
  );
}
