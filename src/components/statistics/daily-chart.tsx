"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DailyChartProps {
  data: { date: string; hours: number }[];
}

export function DailyChart({ data }: DailyChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">每日学习时长（近 30 天）</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                className="text-[10px] text-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                className="text-xs text-muted-foreground"
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#a16207"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#a16207" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
