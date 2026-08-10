"use client";

import { useEffect, useRef } from "react";

/**
 * 每次页面加载时检查：如果今天还没运行过 daily agent，
 * 就在后台触发一次分析。同一浏览器会话只触发一次。
 */
export function DailyAgentCheck() {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    // 用 localStorage 标记今天已经触发过
    const today = new Date().toISOString().slice(0, 10);
    const lastCheckKey = `agent-daily-check-${today}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(lastCheckKey)) {
      return; // 今天已经触发过了
    }

    // 后台触发（fire-and-forget）
    fetch("/api/agent/cron/daily")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          window.localStorage.setItem(lastCheckKey, "1");
          console.log("[DailyAgent] 今日自动分析完成");
        }
      })
      .catch(() => {
        // 静默失败，下次访问再试
      });
  }, []);

  return null; // 不渲染任何东西
}
