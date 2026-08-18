"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function SpeakerIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 256 256" fill="currentColor">
      <path d="M155.51 24.81a8 8 0 0 0-8.42.88L77.25 80H32a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h45.25l69.84 54.31A8 8 0 0 0 160 224V32a8 8 0 0 0-4.49-7.19ZM144 207.64l-57.09-44.4A8 8 0 0 0 82 160H32V96h50a8 8 0 0 0 4.91-1.76L144 48.36ZM211.19 76.7a8 8 0 1 0-10.38 12.18A67.46 67.46 0 0 1 212 144a67.46 67.46 0 0 1-11.19 55.12 8 8 0 1 0 10.38 12.18A83.45 83.45 0 0 0 228 144a83.45 83.45 0 0 0-16.81-67.3Z" />
    </svg>
  );
}

function LowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 256 256" fill="currentColor">
      <path d="M155.51 24.81a8 8 0 0 0-8.42.88L77.25 80H32a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h45.25l69.84 54.31A8 8 0 0 0 160 224V32a8 8 0 0 0-4.49-7.19ZM144 207.64l-57.09-44.4A8 8 0 0 0 82 160H32V96h50a8 8 0 0 0 4.91-1.76L144 48.36Z" />
    </svg>
  );
}

export function AmbientSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.3);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const audio = new Audio("/rain.mp3");
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    // 直接播放；若浏览器拦截则等首次交互后恢复
    audio.play().catch(() => {
      const resume = () => {
        audio.play().catch(() => {});
        document.removeEventListener("click", resume);
        document.removeEventListener("keydown", resume);
      };
      document.addEventListener("click", resume);
      document.addEventListener("keydown", resume);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // 音量变化即同步到 audio
  function changeVolume(v: number) {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }

  // ── 胶囊滑块拖拽逻辑 ──
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY;
    // 顶部=1，底部=0
    const ratio = Math.max(0, Math.min(1, (rect.bottom - y) / rect.height));
    changeVolume(ratio);
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    updateFromEvent(e);
    const onMove = (ev: MouseEvent) => updateFromEvent(ev);
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function showSlider() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }

  function hideSlider() {
    if (dragging.current) return; // 拖拽中不收起
    timer.current = setTimeout(() => setOpen(false), 400);
  }

  const isSilent = volume === 0;
  const fillPercent = Math.round(volume * 100);

  return (
    <div
      className="ambient-sound-control relative z-50 flex items-center"
      onMouseEnter={showSlider}
      onMouseLeave={hideSlider}
    >
      {/* 一体玻璃胶囊 — 按钮 + 滑条统一风格 */}
      <div className={`ambient-sound-shell flex flex-col items-center rounded-full border backdrop-blur-xl shadow-lg transition-all duration-500 ease-out ${
        isSilent
          ? "border-white/[0.1] bg-white/[0.05]"
          : "border-primary/20 bg-primary/[0.06]"
      } ${open ? "rounded-[28px]" : "rounded-full"}`}>
        {/* 按钮区 */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 ${
            isSilent
              ? "text-white/40 hover:text-white/70 hover:bg-white/[0.08]"
              : "text-primary hover:bg-primary/[0.08]"
          }`}
          aria-label="调节音量"
        >
          {isSilent ? <LowIcon /> : <SpeakerIcon />}
        </button>

        {/* 滑块区 — 向下展开 */}
        <div
          className={`flex flex-col items-center gap-2.5 px-2.5 pb-4 transition-all duration-500 ease-out overflow-hidden ${
            open ? "max-h-48 opacity-100 pt-1" : "max-h-0 opacity-0 pt-0 pb-0"
          }`}
        >
          <span className="text-[10px] text-white/40 select-none font-mono">
            {fillPercent}
          </span>

          {/* 胶囊轨道 */}
          <div
            ref={trackRef}
            onMouseDown={handleMouseDown}
            className="relative h-28 w-3.5 rounded-full bg-white/[0.08] cursor-pointer overflow-hidden"
          >
            {/* 填充区 */}
            <div
              className="absolute bottom-0 left-0 right-0 rounded-full bg-gradient-to-t from-primary to-primary transition-[height] duration-75"
              style={{ height: `${fillPercent}%` }}
            />
            {/* 拖拽手柄 */}
            <div
              className="absolute left-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-md border border-white/25 transition-all duration-75"
              style={{ bottom: `calc(${fillPercent}% - 7px)` }}
            />
          </div>

          <span className="text-[10px] text-white/40 select-none font-mono">0</span>
        </div>
      </div>
    </div>
  );
}
