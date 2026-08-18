"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#06150f] p-4">
      <div className="surface max-w-md space-y-5 px-7 py-9 text-center">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Compass className="h-8 w-8" weight="fill" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-white">页面不存在</h1>
        <p className="text-sm text-white/45">
          你要找的页面不存在或已被删除。
        </p>
        <Link href="/">
          <Button>返回首页</Button>
        </Link>
      </div>
    </div>
  );
}
