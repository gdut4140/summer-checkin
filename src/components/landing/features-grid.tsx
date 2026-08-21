"use client";

import { motion } from "motion/react";
import {
  Brain,
  CalendarCheck,
  CaretDown,
  CheckCircle,
  ClockCountdown,
  FileText,
  ListChecks,
  PaperPlaneTilt,
  Sparkle,
} from "@phosphor-icons/react";

const tasks = [
  { label: "复习高数第三章", done: true },
  { label: "完成英语精读", done: true },
  { label: "整理今日错题", done: false },
];

const loopItems = [
  { icon: CalendarCheck, title: "记录", copy: "打卡沉淀每天的行动" },
  { icon: ClockCountdown, title: "专注", copy: "在场景中进入心流" },
  { icon: Brain, title: "复盘", copy: "让 AI 从数据中给出下一步" },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="relative border-y border-white/10 bg-background/88 px-4 py-20 text-white backdrop-blur-2xl md:px-8 md:py-28">
      {/* 向下滚动提示（贴右居中，纯视觉） */}
      <div className="pointer-events-none absolute right-1 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 text-[11px] font-medium text-white/30 sm:text-xs md:right-2 md:flex">
        <span className="[writing-mode:vertical-rl] tracking-widest">向下滚动</span>
        <CaretDown className="size-3.5 animate-bounce" />
      </div>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <p className="text-sm font-semibold text-primary">一张工作台，完成整个学习闭环</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">少一点切换，<br />多一点真正的<span className="text-primary">专注</span></h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-white/58 md:text-lg">
            计划不是孤立的清单。雨宝会读懂你的目标和进度，把任务、专注记录、学习资料与每日复盘连接起来。
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65 }}
          className="mt-14 overflow-hidden rounded-lg border border-white/14 bg-background/74 shadow-[0_32px_90px_rgba(0,0,0,0.28)]"
        >
          <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" />
              <span className="text-xs font-medium text-white/72">今日学习工作台</span>
            </div>
            <span className="text-[11px] text-white/35">8 月 19 日 · 星期三</span>
          </div>

          <div className="grid min-h-[470px] lg:grid-cols-[240px_minmax(0,1fr)_320px]">
            <aside className="hidden border-r border-white/10 p-5 lg:block">
              <p className="text-[11px] text-white/35">进行中的计划</p>
              <div className="mt-5 border-l-2 border-primary pl-4">
                <p className="text-sm font-medium">暑期能力进阶</p>
                <p className="mt-1 text-xs text-white/38">第 12 天 / 共 28 天</p>
              </div>
              <div className="mt-8 space-y-5 text-xs text-white/42">
                <p className="flex items-center gap-3 text-white/78"><ListChecks className="size-4 text-primary" />今日任务</p>
                <p className="flex items-center gap-3"><CalendarCheck className="size-4" />成长日历</p>
                <p className="flex items-center gap-3"><FileText className="size-4" />学习资料</p>
              </div>
              <div className="mt-16 border-t border-white/10 pt-5">
                <p className="text-[11px] text-white/35">本周完成率</p>
                <p className="mt-2 text-2xl font-semibold">86%</p>
                <div className="mt-3 h-1 overflow-hidden bg-white/10"><div className="h-full w-[86%] bg-primary" /></div>
              </div>
            </aside>

            <div className="flex flex-col justify-between p-5 sm:p-8">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-primary">下一步，从这里开始</p>
                    <h3 className="mt-2 text-xl font-semibold sm:text-2xl">完成今天最重要的三件事</h3>
                  </div>
                  <span className="hidden text-xs text-white/35 sm:block">2 / 3 已完成</span>
                </div>
                <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
                  {tasks.map((task) => (
                    <div key={task.label} className="flex min-h-14 items-center gap-3">
                      <CheckCircle className={`size-5 ${task.done ? "text-primary" : "text-white/24"}`} weight={task.done ? "fill" : "regular"} />
                      <span className={`text-sm ${task.done ? "text-white/40 line-through" : "text-white/82"}`}>{task.label}</span>
                      {!task.done && <span className="ml-auto text-[10px] text-primary">待开始</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <ClockCountdown className="size-7 text-primary" weight="duotone" />
                  <div><p className="text-lg font-semibold">25:00</p><p className="text-[11px] text-white/36">森林专注室</p></div>
                </div>
                <button className="h-9 bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/80">开始专注</button>
              </div>
            </div>

            <aside className="border-t border-white/10 bg-black/10 p-5 sm:p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/14 text-primary"><Brain className="size-5" weight="duotone" /></span>
                <div><p className="text-sm font-medium">雨宝</p><p className="text-[10px] text-white/34">AI 学习伙伴 · 在线</p></div>
                <Sparkle className="ml-auto size-4 text-primary" weight="fill" />
              </div>
              <div className="mt-7 text-sm leading-6 text-white/62">
                <p>你已经完成两个任务。根据最近的专注记录，建议先整理错题，再开始新的章节。</p>
                <div className="mt-5 border-l border-primary/60 pl-4">
                  <p className="text-xs text-white/35">今日建议</p>
                  <p className="mt-1 text-white/76">用 25 分钟完成错题归类，难题交给我一起分析。</p>
                </div>
              </div>
              <div className="mt-10 flex h-11 items-center gap-3 border border-white/12 bg-white/[0.035] px-3">
                <span className="flex-1 text-xs text-white/28">问问雨宝下一步做什么…</span>
                <PaperPlaneTilt className="size-4 text-primary" weight="fill" />
              </div>
            </aside>
          </div>
        </motion.div>

        <div id="features" className="mt-10 grid gap-px border-y border-white/10 bg-white/10 sm:grid-cols-3">
          {loopItems.map(({ icon: Icon, title, copy }) => (
            <div key={title} className="flex items-start gap-4 bg-background px-5 py-6 sm:px-7">
              <Icon className="size-6 shrink-0 text-primary" weight="duotone" />
              <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-white/40">{copy}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
