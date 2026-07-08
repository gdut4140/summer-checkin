"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock, Circle, Flame, Fire, Clock, ClockAfternoon, BookOpen, SunHorizon, MoonStars, ListChecks, Trophy } from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { Badge as BadgeType } from "@prisma/client";

const iconMap: Record<string, React.ComponentType<{ className?: string; weight?: "fill" | "regular" }>> = {
  Circle, Flame, Fire, Clock, ClockAfternoon, BookOpen, SunHorizon, MoonStars, ListChecks, Trophy,
};

interface Props {
  earnedBadges: BadgeType[];
  allBadges: BadgeType[];
}

export function BadgesGrid({ earnedBadges, allBadges }: Props) {
  const earnedIds = new Set(earnedBadges.map((b) => b.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Badges</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {allBadges.map((badge, i) => {
            const earned = earnedIds.has(badge.id);
            const Icon = iconMap[badge.icon] ?? Circle;

            return (
              <Tooltip key={badge.id}>
                <TooltipTrigger>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                      earned
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-muted/30 opacity-60"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        earned
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {earned ? (
                        <Icon className="h-5 w-5" weight="fill" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </div>
                    <span className="text-[10px] leading-tight font-medium">
                      {badge.name}
                    </span>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <p className="font-medium text-xs">{badge.name}</p>
                  <p className="text-xs text-muted-foreground">{badge.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{badge.criteria}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
