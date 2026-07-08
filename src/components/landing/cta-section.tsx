"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "@phosphor-icons/react";

export function CTASection() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-14 md:px-16 md:py-20 text-center">
          {/* 克制的品牌色高光，取代整块铺色 */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000,transparent)]" />
          </div>

          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            准备好让这个暑假不一样了吗？
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-[55ch] mx-auto leading-relaxed">
            加入 Summer Checkin，追踪学习进度，积累连续打卡，达成你的暑假目标。
          </p>
          <div className="mt-9">
            <Link href="/register">
              <Button size="lg">
                开始你的学习之旅
                <ArrowRight className="ml-2 h-4 w-4" weight="bold" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
