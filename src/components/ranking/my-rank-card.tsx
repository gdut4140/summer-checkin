"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Clock, Fire } from "@phosphor-icons/react";
import type { LeaderboardEntry } from "@/types";

export function MyRankCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" weight="fill" />
            <span className="text-sm text-muted-foreground">你的排名：</span>
            <span className="text-2xl font-bold text-primary">#{entry.rank}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">学习时长：</span>
            <span className="font-semibold">{entry.totalHours}h</span>
          </div>
          <div className="flex items-center gap-2">
            <Fire className="h-4 w-4 text-orange-500" weight="fill" />
            <span className="text-sm text-muted-foreground">连续打卡：</span>
            <span className="font-semibold">{entry.streak} 天</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
