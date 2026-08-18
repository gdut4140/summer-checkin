"use client";

import { motion } from "motion/react";
import { ChartLine, PencilSimple, Target } from "@phosphor-icons/react";

const steps = [
  { number: "01", icon: PencilSimple, title: "定下方向", description: "创建计划，将想完成的事拆成今天能开始的一小步。" },
  { number: "02", icon: Target, title: "保持行动", description: "用轻量打卡记录专注时刻，让稳定比冲刺更重要。" },
  { number: "03", icon: ChartLine, title: "回看成长", description: "通过数据和 AI 总结理解进步，并决定下一步怎么走。" },
];

export function HowItWorks() {
  return (
    <section className="bg-[#0a281f]/62 px-4 py-20 text-white backdrop-blur-md md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">三步形成节奏</p>
          <h2 className="mt-3 text-3xl font-semibold md:text-5xl">学习不必紧绷，<br />但要一直向前</h2>
        </div>
        <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-0">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative border-white/20 md:border-l md:px-8 first:md:border-l-0 first:md:pl-0"
            >
              <div className="flex items-center justify-between">
                <step.icon className="h-8 w-8 text-primary" weight="duotone" />
                <span className="text-sm text-white/45">{step.number}</span>
              </div>
              <h3 className="mt-8 text-xl font-semibold">{step.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/66">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
