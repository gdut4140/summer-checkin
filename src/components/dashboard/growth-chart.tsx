"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GrowthChartProps {
  data: { date: string; hours: number }[];
}

export function GrowthChart({ data }: GrowthChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">本周学习时长</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="studyHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a16207" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a16207" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                className="text-xs text-muted-foreground"
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
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="#a16207"
                strokeWidth={2}
                fill="url(#studyHours)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
