"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isYesterday } from "date-fns";
import { Clock } from "@phosphor-icons/react";
import type { CheckinWithPlan } from "@/types";

export function RecentActivity({
  checkins,
}: {
  checkins: CheckinWithPlan[];
}) {
  function formatDate(date: Date) {
    if (isToday(date)) return "今天";
    if (isYesterday(date)) return "昨天";
    return format(date, "M月d日");
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">最近动态</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {checkins.length === 0 ? (
          <div className="px-6 pb-6">
            <p className="text-sm text-muted-foreground">
              还没有打卡记录，开始今天的学习吧！
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1 px-6 pb-6">
              {checkins.map((checkin) => (
                <div
                  key={checkin.id}
                  className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {checkin.subject ?? "学习记录"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {checkin.content.slice(0, 60)}
                      {checkin.content.length > 60 ? "..." : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="secondary" className="text-xs h-5">
                      {formatDate(checkin.checkinDate)}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {checkin.hours}h
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
