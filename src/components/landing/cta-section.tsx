"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="px-4 py-24 text-white md:px-8 md:py-32">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold text-[#d7ef83]">下一次打卡，从此刻开始</p>
        <div className="mt-4 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <h2 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">给这个夏天，<br />留下一条向上的轨迹。</h2>
          <Link href="/register" className="shrink-0">
            <Button size="lg" className="bg-[#d7ef83] text-[#051612] hover:bg-[#e4f5a6]">
              创建我的计划
              <ArrowRight className="ml-2 h-4 w-4" weight="bold" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
