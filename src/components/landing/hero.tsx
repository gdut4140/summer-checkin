"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ChartLineUp,
  Check,
  CaretDown,
  Leaf,
  Robot,
  Sparkle,
} from "@phosphor-icons/react";
import ShinyText from "./ShinyText";
import VariableProximity from "@/components/ui/variable-proximity";
import { GithubLink } from "@/components/layout/github-link";

const pulseItems = [
  { icon: CalendarCheck, value: "12 天", label: "连续打卡" },
  { icon: ChartLineUp, value: "86%", label: "本周完成" },
  { icon: Robot, value: "AI 已生成", label: "学习建议" },
];

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <section ref={heroRef} className="relative flex min-h-[100dvh] max-w-[100vw] flex-col overflow-hidden px-5 pb-8 pt-5 text-white md:px-10 md:pb-12">
      {/* 渐变遮罩：左深右透 + 底部暗角 */}
      <div className="pointer-events-none absolute inset-0 landing-hero-overlay" />


      {/* 顶栏 */}
      <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between" aria-label="首页导航">
        <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/35 bg-primary/15 backdrop-blur-md">
              <Leaf className="h-5 w-5 text-primary" weight="fill" />
            </span>
            <span className="text-[15px] tracking-wide">Summer Checkin</span>
          </Link>
        <div className="flex items-center gap-3">
          <GithubLink />
        </div>
      </nav>

      {/* 主内容 */}
      <div className="relative z-10 mx-auto flex min-w-0 w-full max-w-7xl flex-1 flex-col justify-end pt-24 md:pt-28">
        <div className="w-full min-w-0 max-w-4xl animate-[product-enter_700ms_cubic-bezier(0.16,1,0.3,1)_both]">
          {/* 小标签 */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/8 px-3.5 py-1.5 text-[13px] font-medium text-white/85 backdrop-blur-md">
            <Sparkle className="h-3.5 w-3.5 text-primary" weight="fill" />
            <ShinyText
              text="AI 驱动的学习节奏管理"
              speed={2.5}
              color="#ffffff"
              shineColor="var(--primary)"
              spread={45}
              direction="left"
            />
          </div>

          {/* 主标题 — 双色：Summer 白 / Checkin 主题绿 */}
          <h1 className="text-[44px] font-bold leading-[1.02] tracking-tight sm:text-5xl md:text-7xl lg:text-[88px]">
            <span>Summer </span>
            <span className="text-primary">Checkin</span>
          </h1>

          {/* 副标题 — VariableProximity 互动字体 */}
          <VariableProximity
            label="把每一次专注留在风景里。制定计划、完成打卡、观察成长，让 AI 帮你把这个夏天变成一段清晰可见的进步。"
            fromFontVariationSettings="'wght' 400"
            toFontVariationSettings="'wght' 700"
            containerRef={heroRef}
            radius={120}
            falloff="exponential"
            baseColor="rgba(255,255,255,0.8)"
            highlightColor="var(--primary)"
            className="mt-6 max-w-xl text-[15px] leading-relaxed sm:text-base md:text-lg"
          />

          {/* 按钮组 — Uiverse 风格 + 主题色 */}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full border-2 border-primary-foreground bg-primary px-8 py-3.5 text-[15px] font-bold text-primary-foreground shadow-[0_0_0_0_var(--primary-foreground,#051612)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:translate-x-[-2px] hover:shadow-[4px_6px_0_0_var(--primary-foreground,#051612)] active:translate-y-0.5 active:translate-x-[1px] active:shadow-[0_0_0_0_var(--primary-foreground,#051612)]"
            >
              免费开始
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" weight="bold" />
            </Link>

            <Link
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                const target = document.querySelector("#features");
                if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/40 bg-primary/10 px-7 py-3.5 text-[15px] font-semibold text-primary transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:translate-x-[-2px] hover:border-primary/70 hover:bg-primary/20 hover:shadow-[4px_6px_0_0] hover:shadow-primary/35 active:translate-y-0.5 active:translate-x-[1px] active:shadow-none"
            >
              向下探索
              <CaretDown className="size-4 animate-bounce" />
            </Link>
          </div>
        </div>

        {/* 数据栏 */}
        <div className="mt-14 grid w-full min-w-0 max-w-2xl grid-cols-3 overflow-hidden rounded-2xl border border-white/15 bg-black/25 backdrop-blur-md">
          {pulseItems.map((item, idx) => (
            <div
              key={item.label}
              className={`flex min-h-[84px] min-w-0 items-center gap-3 px-4 py-4 sm:px-6 ${
                idx !== 0 ? "border-l border-primary/20" : ""
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/30">
                <item.icon className="h-4.5 w-4.5 text-primary" weight="duotone" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold sm:text-lg">{item.value}</p>
                <p className="mt-0.5 text-[11px] text-white/55 sm:text-xs">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 底部信息 */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-white/60 sm:text-sm">
            <Check className="h-4 w-4 text-primary" weight="bold" />
            你的数据只属于你，随时开始，随时回看
          </div>
        </div>
      </div>
    </section>
  );
}
