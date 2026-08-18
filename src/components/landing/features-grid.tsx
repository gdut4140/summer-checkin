"use client";

import { motion } from "motion/react";
import {
  CalendarCheck,
  ChartLine,
  CheckCircle,
  ListChecks,
  Robot,
  Trophy,
} from "@phosphor-icons/react";

const features = [
  { icon: CheckCircle, title: "每日打卡", description: "记录学习内容、时长和状态，把努力变成有迹可循的积累。" },
  { icon: ListChecks, title: "学习计划", description: "拆解假期目标，管理科目与阶段任务，进度始终清晰。" },
  { icon: CalendarCheck, title: "成长日历", description: "用热力图回看每一天，在连续行动中看见自己的节奏。" },
  { icon: ChartLine, title: "数据洞察", description: "从趋势、时长和科目分布理解学习模式，及时调整方向。" },
  { icon: Trophy, title: "持续激励", description: "连续打卡和成长徽章，让长期坚持更有反馈。" },
  { icon: Robot, title: "AI 学习助手", description: "结合你的计划和记录，获得个性化总结、建议与答疑。" },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="border-y border-white/10 bg-[#071710]/76 px-4 py-20 text-white backdrop-blur-2xl md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
          <div>
            <p className="text-sm font-semibold text-primary">完整学习闭环</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">从今天开始，<br />看见每一步成长</h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-white/58 md:text-lg">
            不堆叠复杂功能，只保留真正帮助你行动的工具。从计划到复盘，每个环节都自然衔接。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="group min-h-56 rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-[0_14px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.065]"
            >
              <feature.icon className="h-8 w-8 text-primary" weight="duotone" />
              <h3 className="mt-8 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/52">{feature.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
