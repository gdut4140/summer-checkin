import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { CheckinWithPlan } from "@/types";

export function ActivityTimeline({ checkins }: { checkins: CheckinWithPlan[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">最近动态</CardTitle>
      </CardHeader>
      <CardContent>
        {checkins.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无动态。</p>
        ) : (
          <div className="relative pl-6 border-l-2 border-border space-y-5">
            {checkins.map((checkin) => (
              <div key={checkin.id} className="relative">
                <div className="absolute -left-[25px] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                <div>
                  <p className="text-sm font-medium">
                    {checkin.subject ?? "学习记录"}
                    {checkin.planName && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {checkin.planName}
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {checkin.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{format(checkin.checkinDate, "yyyy 年 M 月 d 日")}</span>
                    <span>{checkin.hours}h</span>
                    {checkin.mood && <span>{checkin.mood}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
