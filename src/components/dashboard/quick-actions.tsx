"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle,
  ListChecks,
  Robot,
  ArrowRight,
} from "@phosphor-icons/react";

export function QuickActions() {
  const actions = [
    {
      label: "今日打卡",
      description: "记录今天学了什么",
      icon: CheckCircle,
      href: "/checkin",
    },
    {
      label: "制定计划",
      description: "设定你的暑假目标",
      icon: ListChecks,
      href: "/plans/new",
    },
    {
      label: "问问 AI",
      description: "获取学习建议",
      icon: Robot,
      href: "/ai",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {actions.map((action) => (
        <Link key={action.href} href={action.href}>
          <Card className="group hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                <action.icon className="h-5 w-5" weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
