"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "@phosphor-icons/react";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { DetailCard } from "@/components/layout/detail-card";
import {
  announcementPopupKey,
  decideAnnouncementPopup,
  localDayString,
} from "@/lib/announcement-popup";
import { hasSeenTour } from "@/components/onboarding/onboarding-provider";
import { formatRelativeTime } from "@/components/layout/bell-row";
import type { AnnouncementInfo } from "@/types";

/** 本机记一笔（隐私模式下写不了就忽略，服务端那份仍然有效） */
function markLocally(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* 忽略 */
  }
}

/**
 * 每天首次进入弹一次最新公告（只挑 popup=true 的那条）。
 *
 * 去重是两层的：
 * - **本机快路径** —— localStorage 命中就直接返回，连请求都不发
 * - **服务端兜底** —— user.announcementSeenOn，跨设备 / 跨标签页都算数。
 *   日期由客户端按本地时区给出，服务端只做相等比较。
 *
 * 新手引导没看过时先挂起，等引导结束（onboarding-provider 派发 tour:finished）再弹。
 */
export function AnnouncementPopup({ userId }: { userId: string }) {
  const [latest, setLatest] = useState<AnnouncementInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const today = localDayString();
    const key = announcementPopupKey(userId);

    // 本机快路径。读不到 localStorage（隐私模式等）就当作"还没弹过"，
    // 交给服务端那份判断 —— 它按用户存在库里、不依赖浏览器存储，比这里权威。
    let poppedLocally = false;
    try {
      poppedLocally = window.localStorage.getItem(key) === "1";
    } catch {
      /* 忽略 */
    }

    const decision = decideAnnouncementPopup({
      poppedToday: poppedLocally,
      tourSeen: hasSeenTour(userId),
    });
    if (decision === "skip") return;

    const pop = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/announcements");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        // 服务端兜底：别的设备/标签页今天已经弹过了
        if (data?.seenOn === today) {
          markLocally(key);
          return;
        }

        const first = (data?.announcements ?? []).find(
          (a: AnnouncementInfo) => a.popup
        );
        // 当前没有可弹的公告 → 什么都不记，这样当天新发的公告下次进页面就能弹出来
        if (!first) return;

        setLatest(first);
        markLocally(key);
        void fetch("/api/announcements/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day: today }),
        }).catch(() => {
          // 服务端没记上也不影响本次 —— 本机那份已经落了，别的设备下次补上
        });
      } catch {
        // 静默：公告弹不出来不该影响任何事，下次进页面再试
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
  }, [userId]);

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
