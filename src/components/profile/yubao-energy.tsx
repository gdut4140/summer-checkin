"use client";

import { useEffect, useState } from "react";

// ============================================================
// 雨宝精力条：展示今日 AI 用量（剩余精力），有趣的动画样式
// - 流动光效填充条 + 顶端小雨宝光球 + 漂浮微光
// - 精力低时变暗、光球停止浮动；用尽时隐藏光球、显示「没精力了」文案
// - 悬浮诗意提示（CSS group-hover，不依赖 Tooltip 组件 API）
// - 实时：挂载 fetch /api/usage + 每 30s 轮询
// ============================================================

interface TodayUsage {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

const STATUS_LEVELS = [
  { above: 0.7, text: "今天也好精神(●'◡'●)" },
  { above: 0.3, text: "冲冲冲(◔◡◔)" },
  { above: 0.01, text: "有点累了_(´□`」 ∠)_" },
  { above: -1, text: "我宕机了，呃啊" },
];

const SPARKLE_POSITIONS = [
  { left: "18%", delay: "0s" },
  { left: "42%", delay: "0.7s" },
  { left: "66%", delay: "1.3s" },
  { left: "84%", delay: "0.35s" },
];

export function YubaoEnergy() {
  const [usage, setUsage] = useState<TodayUsage | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: TodayUsage | null) => {
          if (alive && d) setUsage(d);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // 加载中占位，避免卡片布局跳动
  if (!usage) return <div className="py-4" />;

  const unlimited = usage.unlimited || usage.limit <= 0;
  const pct = unlimited ? 1 : Math.max(usage.remaining / usage.limit, 0);
  const showSparkles = pct > 0.4;
  const status = STATUS_LEVELS.find((s) => pct > s.above) ?? STATUS_LEVELS[STATUS_LEVELS.length - 1];

  return (
    <div className="group relative cursor-help py-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-primary/80">雨宝的精力</span>
        <span className="tabular-nums text-primary">
          {unlimited ? "∞" : `${Math.round(pct * 100)}%`}
        </span>
      </div>

      <div className="relative mt-2 h-2.5 rounded-full bg-white/8">
        {pct > 0 && (
          <div
            className="energy-fill h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct * 100}%` }}
          />
        )}
        {showSparkles &&
          SPARKLE_POSITIONS.map((s, i) => (
            <span
              key={i}
              className="energy-sparkle"
              style={{ left: s.left, animationDelay: s.delay }}
            />
          ))}
        <span
          className="energy-orb"
          style={{ left: `${pct * 100}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-white/38">
        {status.text}
      </p>

      {/* 悬浮诗意提示 */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-lg shadow-black/20 transition-opacity duration-150 group-hover:opacity-100">
        <p className="font-medium text-primary">雨宝的精力</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          雨宝的精力会随着你的使用而减少。每陪你聊一次，它就悄悄少一点；休息一天，明早又满血归来。
        </p>
      </div>
    </div>
  );
}
