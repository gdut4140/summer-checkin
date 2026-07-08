"use client";

import { motion } from "motion/react";
import {
  CheckCircle,
  ChartLine,
  Robot,
  Trophy,
  CalendarCheck,
  ListChecks,
} from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: CheckCircle,
    title: "每日打卡",
    description: "记录每天学习的内容、时长、心情，留下学习截图。",
  },
  {
    icon: ListChecks,
    title: "学习计划",
    description: "制定暑假学习目标和计划，随时追踪完成进度。",
  },
  {
    icon: CalendarCheck,
    title: "可视化日历",
    description: "GitHub 风格的贡献热力图，一眼看清学习轨迹。",
  },
  {
    icon: ChartLine,
    title: "数据统计",
    description: "日/周/月多维度的学习趋势图表，分析学习模式。",
  },
  {
    icon: Trophy,
    title: "排行榜",
    description: "看看你在所有学习者中的排名，赢取勋章，保持连胜。",
  },
  {
    icon: Robot,
    title: "AI 学习助手",
    description: "获取个性化学习建议、每日总结和智能学习方案。",
  },
];

export function FeaturesGrid() {
  return (
    <section className="px-4 py-20 md:py-28 border-y border-border bg-muted/40">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="text-sm font-medium text-primary mb-3">核心功能</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            帮你保持学习节奏的一切工具
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            从每日打卡到 AI 智能分析，Summer Checkin 为你提供持续进步的完整工具链。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden ring-1 ring-border">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.45,
                delay: i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="bg-card"
            >
              <Card className="h-full border-0 ring-0 rounded-none bg-transparent hover:bg-accent/40 transition-colors duration-300">
                <CardContent className="p-7">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5 ring-1 ring-primary/10">
                    <feature.icon className="h-5 w-5" weight="duotone" />
                  </div>
                  <h3 className="text-base font-semibold mb-1.5 text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
