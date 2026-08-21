"use client";

import { motion } from "motion/react";
import { Brain, ChartLineUp, CaretDown, Fire, Target } from "@phosphor-icons/react";

const weeks = [
  { label: "一", active: true }, { label: "二", active: true }, { label: "三", active: true },
  { label: "四", active: false }, { label: "五", active: true }, { label: "六", active: true }, { label: "日", active: true },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative bg-[#0a281f]/70 px-4 py-14 text-white backdrop-blur-md md:px-8 md:py-18">
      {/* 向下滚动提示（贴右居中，纯视觉） */}
      <div className="pointer-events-none absolute right-1 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 text-[11px] font-medium text-white/30 sm:text-xs md:right-2 md:flex">
        <span className="[writing-mode:vertical-rl] tracking-widest">向下滚动</span>
        <CaretDown className="size-3.5 animate-bounce" />
      </div>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <motion.div initial={{ opacity: 0, x: -18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.55 }}>
            <p className="text-sm font-semibold text-[#d7ef83]">成长不是一个数字</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">看见节奏，<br />才能<span className="text-[#d7ef83]">持续调整</span></h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/56">
              Summer Checkin 不用排行榜制造焦虑。它把任务完成、专注时长和连续行动整理成属于你的趋势，再由雨宝解释变化背后的原因。
            </p>
            <div className="mt-9 flex gap-8 border-t border-white/12 pt-6">
              <div><p className="text-2xl font-semibold">12 天</p><p className="mt-1 text-xs text-white/36">当前连续记录</p></div>
              <div><p className="text-2xl font-semibold">18.5 h</p><p className="mt-1 text-xs text-white/36">累计专注时长</p></div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.6 }} className="border-y border-white/14 bg-black/10 py-6 sm:px-7">
            <div className="flex items-center justify-between px-4 sm:px-0">
              <div><p className="text-xs text-white/38">本周学习轨迹</p><p className="mt-1 text-lg font-semibold">稳定向前</p></div>
              <ChartLineUp className="size-7 text-primary" weight="duotone" />
            </div>
            <div className="mt-8 grid grid-cols-7 gap-2 px-4 sm:px-0">
              {weeks.map((day, index) => (
                <div key={day.label} className="text-center">
                  <div className="flex h-36 items-end justify-center bg-white/[0.025] px-2">
                    <div className={`w-full ${day.active ? "bg-[#d7ef83]/80" : "bg-white/10"}`} style={{ height: `${[54, 72, 48, 22, 84, 64, 78][index]}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] text-white/32">{day.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 grid gap-px bg-white/10 sm:grid-cols-3">
              <div className="bg-[#0a281f] p-4"><Fire className="size-5 text-primary" weight="duotone" /><p className="mt-3 text-sm font-medium">连续行动</p><p className="mt-1 text-[11px] text-white/36">比上周多 2 天</p></div>
              <div className="bg-[#0a281f] p-4"><Target className="size-5 text-primary" weight="duotone" /><p className="mt-3 text-sm font-medium">计划完成</p><p className="mt-1 text-[11px] text-white/36">本周完成率 86%</p></div>
              <div className="bg-[#0a281f] p-4"><Brain className="size-5 text-primary" weight="duotone" /><p className="mt-3 text-sm font-medium">雨宝复盘</p><p className="mt-1 text-[11px] text-white/36">节奏稳定，建议适度休息</p></div>
            </div>
          </motion.div>
        </div>

        <div className="mt-10 grid gap-6 border-t border-white/12 pt-8 md:grid-cols-3 md:gap-0">
          {[
            ["01", "定下方向", "把长期目标拆成今天能开始的一步。"],
            ["02", "进入专注", "在喜欢的场景里完成当下任务。"],
            ["03", "回看调整", "让记录和 AI 告诉你下一步怎么走。"],
          ].map(([number, title, description]) => (
            <div key={number} className="md:border-l md:border-white/12 md:px-8 first:md:border-l-0 first:md:pl-0">
              <span className="text-xs text-[#d7ef83]">{number}</span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/45">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
