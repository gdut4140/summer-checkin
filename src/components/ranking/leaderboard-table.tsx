"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RankBadge } from "@/components/ranking/rank-badge";
import { Fire } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

interface Props {
  entries: LeaderboardEntry[];
  currentUserId: string;
  period: string;
}

export function LeaderboardTable({ entries, currentUserId, period }: Props) {
  const router = useRouter();

  function onPeriodChange(value: string) {
    router.push(`/ranking?period=${value}`);
  }

  return (
    <Card>
      <CardHeader>
        <Tabs value={period} onValueChange={onPeriodChange}>
          <TabsList>
            <TabsTrigger value="weekly">本周</TabsTrigger>
            <TabsTrigger value="monthly">本月</TabsTrigger>
            <TabsTrigger value="alltime">总榜</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">
            暂无排行数据，开始打卡吧！
          </p>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.userId}
                className={cn(
                  "flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors",
                  entry.userId === currentUserId && "bg-primary/5"
                )}
              >
                <div className="w-8 flex-shrink-0">
                  <RankBadge rank={entry.rank} />
                </div>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={entry.image ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {entry.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {entry.name}
                    {entry.userId === currentUserId && (
                      <span className="text-primary ml-1">（你）</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm flex-shrink-0">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Fire className="h-4 w-4 text-orange-500" weight="fill" />
                    {entry.streak}
                  </span>
                  <span className="font-semibold w-16 text-right">
                    {entry.totalHours}h
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
