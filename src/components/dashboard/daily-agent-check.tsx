"use client";

import { useEffect, useRef } from "react";

/**
 * 当天第一次打开 dashboard 时，在后台跑一次属于自己的每日分析。
 *
 * "今天是否已经跑过"由服务端按 userId 判断（见 /api/agent/daily-run）。
 * 这里不用 localStorage 做判断——那只能按浏览器算，换设备 / 无痕 / 清缓存
 * 都会重复触发，而且触发的是全站任务。重复请求由服务端幂等挡掉。
 */
export function DailyAgentCheck() {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    // fire-and-forget：不阻塞页面，失败也不打扰用户
    fetch("/api/agent/daily-run", { method: "POST" }).catch(() => {
      // 静默失败，下次访问再试
    });
  }, []);

  return null; // 不渲染任何东西
}
