"use client";

import { useState } from "react";
import { ListBullets } from "@phosphor-icons/react";
import type { HeadingInfo } from "@/lib/studio/outline";
import { cn } from "@/lib/utils";

interface OutlinePanelProps {
  headings: HeadingInfo[];
  onNavigate: (heading: HeadingInfo) => void;
}

export function OutlinePanel({ headings, onNavigate }: OutlinePanelProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-r border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ListBullets className="size-3.5 text-primary" weight="fill" />
          目录
        </h2>
        <span className="text-[10px] text-muted-foreground/60">{headings.length}</span>
      </div>

      <div className="studio-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {headings.length === 0 ? (
          <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-muted-foreground/60">
            还没有标题
            <br />
            用 # 开头写一个吧
          </p>
        ) : (
          <ul className="flex flex-col gap-px">
            {headings.map((heading, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    onNavigate(heading);
                  }}
                  className={cn(
                    "relative w-full rounded-r-md border-l-2 py-1.5 pr-2 text-left transition-colors",
                    activeIndex === index
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:border-white/15 hover:bg-white/[0.05] hover:text-foreground"
                  )}
                  style={{ paddingLeft: `${12 + (heading.level - 1) * 14}px` }}
                  title={heading.text}
                >
                  <span
                    className={cn(
                      "block leading-snug",
                      heading.level === 1
                        ? "text-xs font-semibold"
                        : heading.level === 2
                          ? "text-xs font-medium"
                          : "text-[11px] text-muted-foreground/80"
                    )}
                  >
                    {heading.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
