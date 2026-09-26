"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "@phosphor-icons/react";
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { DetailCard } from "@/components/layout/detail-card";
import { BellRow, formatRelativeTime } from "@/components/layout/bell-row";
import type { AnnouncementInfo } from "@/types";

/**
 * 列表里的一行摘要：把 Markdown 剥成纯文本。
 * 不剥的话行里会原样露出 `##`、`**`、`[文字](链接)` 这些标记。
 */
function toPreview(md: string, max = 70): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 铃铛面板里的「公告」页 —— 只读列表，点开看完整正文。
 * 列表行用 BellRow、弹层用 DetailCard，都与通知那边共用同一个组件。
 */
export function AnnouncementList() {
  const [items, setItems] = useState<AnnouncementInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AnnouncementInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setItems(data?.announcements ?? []);
      })
      .catch(() => {
        // 静默：公告拉不到不该弹错误提示
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="py-12 text-center text-xs text-muted-foreground/60">加载中…</p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Megaphone className="h-8 w-8 text-muted-foreground/30" />
        <p className="mt-3 text-xs text-muted-foreground">暂无公告</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
        {items.map((a) => (
          <BellRow
            key={a.id}
            dot="bg-primary"
            glow
            highlight
            title={a.title}
            preview={toPreview(a.body)}
            time={formatRelativeTime(a.createdAt)}
            onClick={() => setViewing(a)}
          />
        ))}
      </div>

      <Dialog
        open={viewing !== null}
        onOpenChange={(next) => {
          if (!next) setViewing(null);
        }}
      >
        {viewing && (
          <DetailCard
            icon={Megaphone}
            eyebrow="公告"
            title={viewing.title}
            meta={formatRelativeTime(viewing.createdAt)}
            content={viewing.body}
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
    </>
  );
}
