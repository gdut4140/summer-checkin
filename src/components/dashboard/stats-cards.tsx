"use client";

import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Fire,
  Clock,
  Target,
  Trophy,
  ArrowUp,
  ArrowDown,
} from "@phosphor-icons/react";
import type { DashboardStats } from "@/types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      label: "连续打卡",
      value: `${stats.streak}`,
      unit: "天",
      icon: Fire,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      trend: stats.streak >= 7 ? "up" : "neutral",
    },
    {
      label: "今日学习",
      value: `${stats.todayHours}`,
      unit: "小时",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-600/10",
      trend: stats.todayHours > 0 ? "up" : "neutral",
    },
    {
      label: "本周完成率",
      value: `${stats.weekCompletion}`,
      unit: "%",
      icon: Target,
      color: "text-rose-600",
      bg: "bg-rose-600/10",
      trend: stats.weekCompletion >= 70 ? "up" : stats.weekCompletion > 0 ? "down" : "neutral",
    },
    {
      label: "排名",
      value: `#${stats.userRank}`,
      unit: `/ ${stats.totalUsers}`,
      icon: Trophy,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      trend: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: i * 0.08,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <Card className="hover:shadow-sm transition-shadow duration-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {card.label}
                </span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg} ${card.color}`}>
                  <card.icon className="h-5 w-5" weight="fill" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{card.value}</span>
                <span className="text-sm text-muted-foreground">
                  {card.unit}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                {card.trend === "up" && (
                  <ArrowUp className="h-3 w-3 text-amber-700" weight="fill" />
                )}
                {card.trend === "down" && (
                  <ArrowDown className="h-3 w-3 text-red-500" weight="fill" />
                )}
                <span className="text-xs text-muted-foreground">
                  {card.trend === "up"
                    ? "表现不错"
                    : card.trend === "down"
                    ? "继续加油"
                    : "刚刚开始"}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
