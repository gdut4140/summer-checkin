"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckin } from "./actions";
import { toast } from "sonner";

export function CheckinButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCheckin() {
    setLoading(true);
    const result = await dailyCheckin();
    setLoading(false);

    if (result.success) {
      toast.success("雨林又多了你的足迹 🌿");
      router.refresh();
    } else {
      toast.error(result.error || "出错了");
    }
  }

  return (
    <button
      onClick={handleCheckin}
      disabled={loading}
      className="group relative inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/20 transition-all hover:bg-primary/92 active:scale-95 disabled:opacity-60"
    >
      <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/0 via-white/10 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/25 border-t-primary-foreground" />
          正在记录
        </>
      ) : (
        <>
          <svg className="relative h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h2" />
            <path d="M6 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3.3-4 7-4 7s-4-3.7-4-7Z" />
            <path d="M20 12h2" />
            <path d="M14 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3.3-4 7-4 7s-4-3.7-4-7Z" />
          </svg>
            <span className="relative">来访雨林</span>
        </>
      )}
    </button>
  );
}
