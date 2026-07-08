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
    <html>
      <body>
        <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
          <div className="text-center space-y-5 max-w-md">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <WarningCircle className="h-8 w-8" weight="fill" />
              </div>
            </div>
            <h1 className="text-xl font-bold">出错了</h1>
            <p className="text-sm text-muted-foreground">
              {error.message || "发生了意外错误，请重试。"}
            </p>
            <Button onClick={reset}>重试</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
