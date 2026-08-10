"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] items-center justify-center p-4">
      <div className="surface max-w-md space-y-4 px-6 py-8 text-center">
        <p className="product-eyebrow">Something interrupted</p>
        <h2 className="text-xl font-semibold text-white">这一步没有完成</h2>
        <p className="text-sm text-white/46">
          {error.message || "发生了意外错误，请稍后重试。"}
        </p>
        <Button onClick={reset} variant="outline">
          重新尝试
        </Button>
      </div>
    </div>
  );
}
