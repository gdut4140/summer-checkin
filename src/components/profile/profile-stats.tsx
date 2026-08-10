"use client";

import { Clock, CheckCircle, Fire } from "@phosphor-icons/react";
import { motion } from "motion/react";

interface Props {
  totalHours: number;
  totalCheckins: number;
  streak: number;
}

export function ProfileStats({ totalHours, totalCheckins, streak }: Props) {
  const stats = [
    { label: "总学习时长", value: `${totalHours}h`, icon: Clock, color: "text-emerald-400" },
    { label: "总打卡次数", value: totalCheckins.toString(), icon: CheckCircle, color: "text-emerald-300" },
    { label: "当前连续", value: `${streak} 天`, icon: Fire, color: "text-emerald-300" },
  ];

  return (
    <div className="metric-strip metric-strip--three my-5">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
        >
          <div className="p-4 text-center md:py-5">
              <div className="mb-2 flex justify-center">
                <stat.icon className={`h-5 w-5 ${stat.color}`} weight="fill" />
              </div>
              <p className="text-xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
