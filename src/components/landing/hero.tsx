"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarCheck,
  ChartLineUp,
  Check,
  Leaf,
  Robot,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const pulseItems = [
  { icon: CalendarCheck, value: "12 天", label: "连续打卡" },
  { icon: ChartLineUp, value: "86%", label: "本周完成" },
  { icon: Robot, value: "已生成", label: "AI 学习建议" },
];

export function Hero() {
  return (
    <section className="relative flex min-h-[94dvh] flex-col overflow-hidden px-4 pb-14 pt-5 text-white md:px-8 md:pb-18">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between" aria-label="首页导航">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/35 bg-white/18 backdrop-blur-xl">
            <Leaf className="h-5 w-5" weight="fill" />
          </span>
          <span>Summer Checkin</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white">登录</Button>
          </Link>
          <Link href="/register">
            <Button className="bg-[#f3c969] text-[#17352d] hover:bg-[#ffdc86]">开始打卡</Button>
          </Link>
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end pt-24 md:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl"
        >
          <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-white/86">
            <Sparkle className="h-4 w-4 text-[#f3c969]" weight="fill" />
            AI 驱动的学习节奏管理
          </div>
          <h1 className="text-5xl font-semibold leading-[1.03] md:text-7xl lg:text-8xl">
            Summer Checkin
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/84 md:text-xl">
            把每一次专注留在风景里。制定计划、完成打卡、观察成长，让 AI 帮你把这个夏天变成一段清晰可见的进步。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register">
              <Button size="lg" className="bg-[#f3c969] text-[#17352d] shadow-lg shadow-black/10 hover:bg-[#ffdc86]">
                免费开始
                <ArrowRight className="ml-2 h-4 w-4" weight="bold" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant="outline" className="border-white/45 bg-white/10 text-white backdrop-blur-lg hover:bg-white/20 hover:text-white">
                看看如何使用
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-12 grid max-w-3xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-white/30 bg-white/20 backdrop-blur-2xl sm:grid-cols-3"
        >
          {pulseItems.map((item) => (
            <div key={item.label} className="flex min-h-24 items-center gap-4 bg-[#103a31]/34 px-5 py-4">
              <item.icon className="h-6 w-6 shrink-0 text-[#f3c969]" weight="duotone" />
              <div>
                <p className="text-lg font-semibold">{item.value}</p>
                <p className="mt-0.5 text-sm text-white/65">{item.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="mt-5 flex items-center gap-2 text-sm text-white/68">
          <Check className="h-4 w-4 text-[#f3c969]" weight="bold" />
          你的数据只属于你，随时开始，随时回看
        </div>
      </div>
    </section>
  );
}
