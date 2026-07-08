"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { SignOut } from "@phosphor-icons/react";

export function LogoutButton({ label }: { label?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  if (label) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2 text-sm"
      >
        <SignOut className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleLogout}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
    >
      <SignOut className="h-4 w-4" />
    </Button>
  );
}
