"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
      <div className="text-center space-y-5 max-w-md">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="h-8 w-8" weight="fill" />
          </div>
        </div>
        <h1 className="text-3xl font-bold">页面不存在</h1>
        <p className="text-sm text-muted-foreground">
          你要找的页面不存在或已被删除。
        </p>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
      </div>
    </div>
  );
}
