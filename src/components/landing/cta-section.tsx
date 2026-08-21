"use client";

import Link from "next/link";
import { ArrowRight, CaretDown, Check, Leaf } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section id="cta" className="relative overflow-hidden px-4 py-24 text-white md:px-8 md:py-32">
      <div className="pointer-events-none absolute inset-0 landing-cta-overlay" />
      <div className="relative mx-auto max-w-7xl border-y border-primary/20 py-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Leaf className="size-4" weight="fill" />下一次行动，从此刻开始</div>
            <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">给认真成长的自己，<br />留下一条<span className="text-primary">清晰的轨迹</span>。</h2>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/48">
              <span className="flex items-center gap-2"><Check className="text-primary" />免费开始</span>
              <span className="flex items-center gap-2"><Check className="text-primary" />数据归你所有</span>
              <span className="flex items-center gap-2"><Check className="text-primary" />随时调整计划</span>
            </div>
          </div>
          <Link href="/register" className="shrink-0">
            <span className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-primary-foreground bg-primary px-7 text-sm font-bold text-primary-foreground shadow-[4px_6px_0_0_var(--primary-foreground,#051612)] transition-all hover:-translate-y-1 hover:translate-x-[-2px] hover:shadow-[6px_8px_0_0_var(--primary-foreground,#051612)]">
              创建我的学习空间
              <ArrowRight className="h-4 w-4" weight="bold" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
