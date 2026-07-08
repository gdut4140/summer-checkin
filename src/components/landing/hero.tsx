"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";

export function Hero() {
  return (
    <section className="relative min-h-[100dvh] flex items-center px-4 py-20 md:py-24 pt-28 md:pt-32 overflow-hidden">
      {/* 考究的底纹：细网格 + 单一克制的径向高光，取代通用的模糊色块 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_40%,transparent_100%)] opacity-70" />
        <div className="absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/15" />
        <div className="absolute bottom-0 left-1/2 h-px w-full -translate-x-1/2 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto w-full">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-3.5 py-1.5 text-sm text-muted-foreground mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <Sparkle className="h-3.5 w-3.5 text-primary" weight="fill" />
              AI 驱动的学习伴侣
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02] text-foreground"
          >
            记录你的暑假
            <br />
            <span className="bg-gradient-to-r from-primary via-amber-500 to-orange-500 bg-clip-text text-transparent">
              学习之旅
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-[58ch] leading-relaxed"
          >
            每日打卡、学习计划、GitHub 风格热力图、AI 学习助手，
            帮你在这个夏天建立更好的学习习惯。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link href="/register">
              <Button size="lg">
                免费开始
                <ArrowRight className="ml-2 h-4 w-4" weight="bold" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="ghost">登录</Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 flex items-center gap-4 text-sm text-muted-foreground"
          >
            <div className="flex -space-x-2">
              {["from-amber-400 to-orange-500", "from-orange-400 to-rose-500", "from-rose-400 to-pink-500", "from-yellow-400 to-amber-500"].map((g, i) => (
                <div
                  key={i}
                  className={`h-7 w-7 rounded-full bg-gradient-to-br ${g} ring-2 ring-background`}
                />
              ))}
            </div>
            <span>已有众多学习者在此坚持打卡</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
