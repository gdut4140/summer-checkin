"use client";

import { useState } from "react";
import { toast } from "sonner";
import { USER_AVATAR_PRESETS, type UserAvatarPreset } from "@/lib/avatar-presets";

interface Props {
  current: string | null;
  onSelect: (id: string) => void;
}

export function AvatarPicker({ current, onSelect }: Props) {
  const [saving, setSaving] = useState<string | null>(null);

  async function handleSelect(p: UserAvatarPreset) {
    if (p.id === current) return;
    setSaving(p.id);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: p.id }),
      });
      if (!res.ok) throw new Error("Failed");
      onSelect(p.id);
      toast.success("头像已更新");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="grid max-h-[62vh] grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5">
      {USER_AVATAR_PRESETS.map((p) => {
        const isActive = current === p.id;
        const isLoading = saving === p.id;
        return (
          <button
            key={p.id}
            onClick={() => handleSelect(p)}
            disabled={!!saving}
            className={
              "aspect-square overflow-hidden rounded-2xl bg-foreground/[0.06] transition-all duration-200 ease-out " +
              (isActive
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.04] shadow-lg "
                : "hover:scale-[1.06] hover:ring-1 hover:ring-foreground/25 shadow-sm hover:shadow-md ") +
              (isLoading ? "animate-pulse" : "")
            }
          >
            <img
              src={p.src}
              alt="头像"
              draggable={false}
              loading="lazy"
              className="h-full w-full rounded-2xl object-cover"
            />
          </button>
        );
      })}
    </div>
  );
}
