"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Megaphone } from "@phosphor-icons/react";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { DetailCard } from "@/components/layout/detail-card";
import {
  decideAnnouncementPopup,
  localDayString,
} from "@/lib/announcement-popup";
import { hasSeenTour } from "@/components/onboarding/onboarding-provider";
import { formatRelativeTime } from "@/components/layout/bell-row";
import type { AnnouncementInfo } from "@/types";

/** 两次服务端查询之间的最小间隔：站内跳页会重跑 effect，用来限流 */
const MIN_RECHECK_MS = 60_000;

/**
 * 每天首次进入弹一次最新公告（只挑 popup=true 的那条）。
 *
 * **去重只有一个真相源：服务端的 `user.announcementSeenOn`**（客户端按本地时区
 * 给出日期，服务端只做相等比较）。这里刻意不做本机缓存 —— 曾经用 localStorage
 * 做过「快路径省请求」，结果同一个事实存在两处，重置服务端字段后用户的浏览器
 * 里还留着旧标记，表现为「我明明改了怎么不弹」。
 *
 * 触发时机跟着 `pathname` 走，而不是只在挂载时跑一次：
 * Next.js 的 layout 在站内跳页时【不会】重新挂载，只看 [] 依赖的话，
 * 一个下午都开着标签页的用户永远等不到公告。跟着 pathname 就能在用户
 * 下一次点任何站内链接时补上。跳页频繁，所以 60 秒内不重复查。
 *
 * 新手引导没看过时先挂起，等引导结束（onboarding-provider 派发 tour:finished）
 * 再弹 —— 完成和直接叉掉都会派发。
 */
export function AnnouncementPopup({ userId }: { userId: string }) {
  const [latest, setLatest] = useState<AnnouncementInfo | null>(null);
  const pathname = usePathname();
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const today = localDayString();
    const decision = decideAnnouncementPopup({
      tourSeen: hasSeenTour(userId),
    });

    const pop = async () => {
      if (cancelled) return;

      // 限流放在 pop 内部而不是 effect 顶部：否则跳页触发的重跑会提前 return，
      // 顺手把上一轮注册的 tour:finished 监听在 cleanup 里摘掉，引导结束后就没人弹了。
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_RECHECK_MS) return;
      lastCheckRef.current = now;

      try {
        const res = await fetch("/api/announcements");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        // 今天已经弹过了（可能是别的设备/标签页弹的）——服务端说了算
        if (data?.seenOn === today) return;

        const first = (data?.announcements ?? []).find(
          (a: AnnouncementInfo) => a.popup
        );
        // 当前没有可弹的公告 → 什么都不记，这样当天新发的公告下次跳页就能弹出来
        if (!first) return;

        setLatest(first);
        void fetch("/api/announcements/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day: today }),
        }).catch(() => {
          // 服务端没记上也不影响本次；下次跳页会再弹一遍
        });
      } catch {
        // 静默：公告弹不出来不该影响任何事，下次跳页再试
      }
    };

    const onTourFinished = () => {
      void pop();
    };

    if (decision === "now") {
      // 首屏多等一拍，避开背景视频 / 组件挂载
      timer = window.setTimeout(() => void pop(), 1200);
    } else {
      window.addEventListener("tour:finished", onTourFinished);
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("tour:finished", onTourFinished);
    };
  }, [userId, pathname]);

  return (
    <Dialog
      open={latest !== null}
      onOpenChange={(next) => {
        if (!next) setLatest(null);
      }}
    >
      {latest && (
        <DetailCard
          icon={Megaphone}
          eyebrow="公告"
          title={latest.title}
          meta={formatRelativeTime(latest.createdAt)}
          content={latest.body}
          action={
            <DialogClose
              render={<button type="button" className="btn-sticker w-full" />}
            >
              知道了
            </DialogClose>
          }
        />
      )}
    </Dialog>
  );
}
