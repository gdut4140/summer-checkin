"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock, CheckCircle, Fire } from "@phosphor-icons/react";
import { motion } from "motion/react";

interface Props {
  totalHours: number;
  totalCheckins: number;
  streak: number;
}

export function ProfileStats({ totalHours, totalCheckins, streak }: Props) {
  const stats = [
    { label: "总学习时长", value: `${totalHours}h`, icon: Clock, color: "text-amber-700" },
    { label: "总打卡次数", value: totalCheckins.toString(), icon: CheckCircle, color: "text-orange-600" },
    { label: "当前连续", value: `${streak} 天`, icon: Fire, color: "text-rose-500" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
        >
          <Card>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} weight="fill" />
              </div>
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
