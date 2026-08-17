"use client";

import { Button } from "@/components/ui/button";
import { WarningCircle } from "@phosphor-icons/react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // 分段级错误边界渲染在根布局 <body> 内部，不能再包 <html><body>（否则 React 19 报 body 单例冲突）
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#06150f] p-4">
      <div className="surface max-w-md space-y-5 px-7 py-9 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <WarningCircle className="h-8 w-8" weight="fill" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-white">出错了</h1>
        <p className="text-sm text-white/45">
          {error.message || "发生了意外错误，请重试。"}
        </p>
        <Button onClick={reset}>重试</Button>
      </div>
    </div>
  );
}
