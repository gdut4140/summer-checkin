"use client";

import { useEffect, useRef, useState } from "react";
import { useScene, type SceneType } from "@/context/scene-context";
import AccordionGallery, { type GalleryItem } from "@/components/studio/accordion-gallery";
import { TreeEvergreen } from "@phosphor-icons/react/dist/ssr";

// 场景手风琴画廊（与文档工作台切换场景动画同源：/rain.webp /snow.webp /cloud.webp）
const SCENE_GALLERY: GalleryItem[] = [
  { image: "/rain.webp", label: "雨林", value: "rain" },
  { image: "/snow.webp", label: "雪日", value: "snow" },
  { image: "/cloud.webp", label: "暖云", value: "cloud" },
];

export function SceneSelector() {
  const { scene, setScene } = useScene();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击弹层外部自动关闭
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const activeIndex = SCENE_GALLERY.findIndex((s) => s.value === scene);

  return (
    <div ref={containerRef} className="relative inline-block" data-tour="scene-selector">
      {/* 场景切换按钮：样式与"沉浸模式"按钮一致，跟随主题色 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 mt-10 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-[1.03] hover:bg-primary/90 active:scale-95"
        aria-label="切换学习场景"
      >
        <TreeEvergreen className="size-4" weight="bold" />
        场景切换
      </button>

      {/* 弹出：文档同款手风琴场景切换动画 */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[400px] max-w-[calc(100vw-2rem)] rounded-xl border border-foreground/12 bg-background/95 p-2.5 shadow-2xl backdrop-blur-xl">
          <AccordionGallery
            items={SCENE_GALLERY}
            activeIndex={activeIndex}
            trigger="hover"
            height={150}
            expandRatio={0.5}
            gap={6}
            radius={10}
            tilt={5}
            onSelect={(_i, item) => {
              if (item.value) setScene(item.value as SceneType);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
