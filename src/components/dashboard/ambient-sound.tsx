"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScene, type SceneType } from "@/context/scene-context";

/** 场景 → 对应环境音资源；没有专属音频的场景返回 null，播放时静默 */
const SCENE_AUDIO_SRC: Record<SceneType, string | null> = {
  rain: "/rain.mp3",
  snow: "/snow.wav",
  cloud: "/rain.mp3", // 暖云暂未配音频，保持静默
};

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

/**
 * 尝试自动播放音频；被浏览器拦截时，在首次用户交互后恢复一次。
 * cleanup 调用方负责解绑。
 */
function playWithUserGestureFallback(audio: HTMLAudioElement) {
  const resume = () => {
    audio.play().catch(() => { });
    document.removeEventListener("click", resume);
    document.removeEventListener("keydown", resume);
  };
  audio.play().catch(() => {
    document.addEventListener("click", resume);
    document.addEventListener("keydown", resume);
  });
  return () => {
    document.removeEventListener("click", resume);
    document.removeEventListener("keydown", resume);
  };
}

export function AmbientSound() {
  const { scene } = useScene();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.3);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupFallbackRef = useRef<(() => void) | null>(null);
  const volumeRef = useRef(0.3);
  volumeRef.current = volume;

  // 1) 创建音频实例（仅一次）
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = volumeRef.current;
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      cleanupFallbackRef.current?.();
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // 2) 场景变化时切换 src，保持音量与播放连续性
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextSrc = SCENE_AUDIO_SRC[scene];

    // 新场景没有音频：暂停并清空
    if (!nextSrc) {
      audio.pause();
      cleanupFallbackRef.current?.();
      cleanupFallbackRef.current = null;
      if (audio.src) audio.src = "";
      return;
    }

    const wasPlaying = !audio.paused && !audio.ended && !!audio.src;

    // 同一份 src 不重复加载（防初始化或快速来回切换抖动）
    const absoluteNext = new URL(nextSrc, window.location.origin).href;
    if (audio.src === absoluteNext) {
      if (wasPlaying) return;
      cleanupFallbackRef.current?.();
      cleanupFallbackRef.current = playWithUserGestureFallback(audio);
      return;
    }

    audio.src = nextSrc;
    audio.load();
    cleanupFallbackRef.current?.();
    cleanupFallbackRef.current = playWithUserGestureFallback(audio);
  }, [scene]);

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
  // 用于区分「按下+不拖动」的 click 与拖拽，保证不拖拽时也不会误收起
  const pressedPoint = useRef<{ x: number; y: number } | null>(null);

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
    pressedPoint.current = { x: e.clientX, y: e.clientY };
    updateFromEvent(e);
    const onMove = (ev: MouseEvent) => updateFromEvent(ev);
    const onUp = () => {
      dragging.current = false;
      pressedPoint.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function toggleOpen() {
    // 若用户刚结束拖拽并把 mouseup 冒泡到按钮（正常不会；但留个闸门更稳）
    if (pressedPoint.current) return;
    setOpen((prev) => !prev);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // 点击组件外部自动收起（「点击才弹出」语义下更自然的配对交互）
  useEffect(() => {
    if (!open) return;
    const root = document.querySelector<HTMLDivElement>(".ambient-sound-control");
    if (!root) return;
    const onDocClick = (e: MouseEvent) => {
      if (dragging.current) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isSilent = volume === 0;
  const fillPercent = Math.round(volume * 100);

  return (
    <div className="ambient-sound-control relative z-50 flex items-center">
      {/* 一体玻璃胶囊 — 按钮 + 滑条统一风格 */}
      <div
        className={`ambient-sound-shell flex flex-col items-center rounded-full border backdrop-blur-xl shadow-lg transition-all duration-500 ease-out ${isSilent
            ? "border-white/[0.1] bg-white/[0.05]"
            : "border-primary/20 bg-primary/[0.06]"
          } ${open ? "rounded-[28px]" : "rounded-full"}`}
      >
        {/* 按钮区 */}
        <button
          onClick={toggleOpen}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 ${isSilent
              ? "text-white/40 hover:text-white/70 hover:bg-white/[0.08]"
              : "text-primary hover:bg-primary/[0.08]"
            }`}
          aria-label="调节音量"
          aria-expanded={open}
          aria-haspopup="slider"
        >
          {isSilent ? <LowIcon /> : <SpeakerIcon />}
        </button>

        {/* 滑块区 — 点击后向下展开，无数字 */}
        <div
          className={`flex flex-col items-center gap-0 px-2.5 pb-4 transition-all duration-500 ease-out overflow-hidden ${open ? "max-h-48 opacity-100 pt-3" : "max-h-0 opacity-0 pt-0 pb-0"
            }`}
        >
          {/* 胶囊轨道 */}
          <div
            ref={trackRef}
            onMouseDown={handleMouseDown}
            className="relative h-28 w-3.5 rounded-full bg-white/[0.08] cursor-pointer overflow-hidden"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fillPercent}
            aria-label="音量"
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
        </div>
      </div>
    </div>
  );
}
