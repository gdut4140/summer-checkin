"use client";

import { useState } from "react";
import { toast } from "sonner";

const PRESETS = [
  { id: "seed", bg: "#051612", fg: "hsl(var(--primary))", shape: "🌱" },
  { id: "leaf", bg: "#0a241e", fg: "hsl(var(--primary))", shape: "🌿" },
  { id: "tree", bg: "#0d3027", fg: "hsl(var(--primary))", shape: "🌳" },
  { id: "water", bg: "#0c1f19", fg: "#67b4c9", shape: "💧" },
  { id: "mountain", bg: "#134236", fg: "hsl(var(--primary))", shape: "⛰️" },
  { id: "sun", bg: "#1a5c4b", fg: "#f3c969", shape: "🌤️" },
  { id: "moon", bg: "#0a241e", fg: "#c8b45a", shape: "🌙" },
  { id: "flower", bg: "#1f735e", fg: "#e0886a", shape: "🌸" },
  { id: "star", bg: "#051612", fg: "#f3c969", shape: "⭐" },
  { id: "frog", bg: "#0d3027", fg: "#88ccb5", shape: "🐸" },
  { id: "owl", bg: "#134236", fg: "#c8b45a", shape: "🦉" },
  { id: "fox", bg: "#0c1f19", fg: "#e0886a", shape: "🦊" },
];

interface Props {
  current: string | null;
  onSelect: (id: string) => void;
}

export function AvatarPicker({ current, onSelect }: Props) {
  const [saving, setSaving] = useState<string | null>(null);

  async function handleSelect(id: string) {
    if (id === current) return;
    setSaving(id);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: id }),
      });
      if (!res.ok) throw new Error("Failed");
      onSelect(id);
      toast.success("头像已更新");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {PRESETS.map((p) => {
        const isActive = current === p.id;
        const isLoading = saving === p.id;
        return (
          <button
            key={p.id}
            onClick={() => handleSelect(p.id)}
            disabled={!!saving}
            className={`flex aspect-square items-center justify-center rounded-xl text-3xl transition-all ${
              isActive
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                : "hover:scale-105 hover:ring-1 hover:ring-white/20"
            } ${isLoading ? "animate-pulse" : ""}`}
            style={{ backgroundColor: p.bg }}
            title={p.id}
          >
            {p.shape}
          </button>
        );
      })}
    </div>
  );
}
