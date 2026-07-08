"use client";

import { motion } from "motion/react";
import { PencilSimple, Target, ChartLine } from "@phosphor-icons/react";

const steps = [
  {
    number: "01",
    icon: PencilSimple,
    title: "制定目标",
    description: "创建学习计划，设定科目和时长目标，规划你的暑假学习蓝图。",
  },
  {
    number: "02",
    icon: Target,
    title: "每日打卡",
    description: "记录每天的学习内容、时间和心情，积累连续打卡天数。",
  },
  {
    number: "03",
    icon: ChartLine,
    title: "追踪成长",
    description: "通过图表、热力图和 AI 分析观察进步，获得成就勋章。",
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-16">
          <p className="text-sm font-medium text-primary mb-3">使用流程</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            三步开始
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            简单三步，让这个暑假的学习变得有迹可循。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.5,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative rounded-2xl border border-border bg-card p-7 overflow-hidden"
            >
              <span className="pointer-events-none absolute -right-2 -top-4 text-7xl font-bold text-muted-foreground/10 select-none">
                {step.number}
              </span>
              <div className="relative">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-primary-foreground mb-5 shadow-sm shadow-primary/20">
                  <step.icon className="h-6 w-6" weight="duotone" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
