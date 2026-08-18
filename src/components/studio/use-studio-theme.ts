"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

/* ────────────────────────────────────────────────────────────
   7 预设套餐：每个套餐绑定 主题色 + 背景，不可单独拆分
   ──────────────────────────────────────────────────────────── */

export type StudioPreset =
  | "dark-rain" // 雨林：dark + rain 视频
  | "light-snow" // 雪日：light + snow 图
  | "khaki-cloud" // 暖云：黑底白字 + cloud 图
  | "dark-pure" // 暗色：dark 无背景
  | "light-pure" // 亮色：light 无背景
  | "khaki-pure" // 卡其：khaki 无背景
  | "matcha-pure"; // 抹茶：light 淡白绿 无背景

/** 内部主题色（映射到 CSS .studio-theme-{dark|light|khaki}） */
export type StudioTheme = "dark" | "light" | "khaki";

/** 背景类型 */
export type StudioBgType = "image" | "video" | "none";

interface PresetConfig {
  theme: StudioTheme;
  bgType: StudioBgType;
  bgSrc: string | null;
  label: string;
  /** 是否带背景图/视频 */
  hasBg: boolean;
}

const PRESET_MAP: Record<StudioPreset, PresetConfig> = {
  "dark-rain": { theme: "dark", bgType: "video", bgSrc: "/rain.mp4", label: "雨林", hasBg: true },
  "light-snow": { theme: "dark", bgType: "image", bgSrc: "/snow.png", label: "雪日", hasBg: true },
  "khaki-cloud": { theme: "dark", bgType: "image", bgSrc: "/cloud.png", label: "暖云", hasBg: true }, // 黑底白字
  "dark-pure": { theme: "dark", bgType: "none", bgSrc: null, label: "暗色", hasBg: false },
  "light-pure": { theme: "light", bgType: "none", bgSrc: null, label: "亮色", hasBg: false },
  "khaki-pure": { theme: "khaki", bgType: "none", bgSrc: null, label: "卡其", hasBg: false },
  "matcha-pure": { theme: "light", bgType: "none", bgSrc: null, label: "抹茶", hasBg: false },
};

/** 透明度固定的套餐（不支持调整） */
const FIXED_OPACITY_PRESETS: Partial<Record<StudioPreset, number>> = {
  "light-snow": 50,
  "dark-rain": 90,
};

/** 透明度范围限制的套餐（支持调整但限定范围 + 自定义标签） */
const OPACITY_RANGE_PRESETS: Partial<
  Record<StudioPreset, { min: number; max: number; default: number; label: string }>
> = {
  "khaki-cloud": { min: 50, max: 90, default: 70, label: "氛围" },
};

export function getPresetConfig(preset: StudioPreset): PresetConfig {
  return PRESET_MAP[preset];
}

const STORAGE_KEY = "studio-theme:v2";
const GLOBAL_SCENE_KEY = "summer-checkin-scene";
const VALID_PRESETS = Object.keys(PRESET_MAP) as StudioPreset[];

interface Persisted {
  preset: StudioPreset;
  opacity: number; // 0-100
}

const DEFAULT: Persisted = {
  preset: "dark-rain",
  opacity: 30,
};

/** 全局 Scene → Studio Preset 映射（首次进 Studio 时，跟随全局场景走） */
const SCENE_TO_PRESET: Record<string, StudioPreset> = {
  rain: "dark-rain",
  snow: "light-snow",
  cloud: "khaki-cloud",
};

/** 每个场景 preset 的默认透明度（和现有 fixed/range 默认保持一致） */
const SCENE_DEFAULT_OPACITY: Record<StudioPreset, number> = {
  "dark-rain": 90, // FIXED_OPACITY_PRESETS 里的固定值
  "light-snow": 50, // FIXED_OPACITY_PRESETS 里的固定值
  "khaki-cloud": 70, // OPACITY_RANGE_PRESETS 里的 default
  "dark-pure": 30,
  "light-pure": 30,
  "khaki-pure": 30,
  "matcha-pure": 30,
};

function parsePersisted(raw: string | null): Persisted {
  if (!raw) return DEFAULT;
  try {
    const obj = JSON.parse(raw) as Partial<Persisted>;
    return {
      preset: VALID_PRESETS.includes(obj.preset as StudioPreset) ? (obj.preset as StudioPreset) : DEFAULT.preset,
      opacity: typeof obj.opacity === "number" ? Math.min(100, Math.max(0, Math.round(obj.opacity))) : DEFAULT.opacity,
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * 客户端同步读取 localStorage（在 useState 初始化器中调用，避免首帧→useEffect 两阶段渲染闪屏）
 * SSR / 非浏览器环境返回 DEFAULT
 *
 * 规则：
 *  1. 已有 studio-theme:v2 记录 → 尊重用户在 Studio 内部的独立选择，直接用
 *  2. 没存过（首次进文档） → 跟随全局 scene 选对应 preset：rain→dark-rain / snow→light-snow / cloud→khaki-cloud
 */
function readInitialPersisted(): Persisted {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const studioRaw = window.localStorage.getItem(STORAGE_KEY);
    if (studioRaw) return parsePersisted(studioRaw);

    // Studio 主题从未存过 → 看全局场景选择
    const scene = window.localStorage.getItem(GLOBAL_SCENE_KEY);
    const presetFromScene = scene ? SCENE_TO_PRESET[scene] : undefined;
    if (presetFromScene) {
      return {
        preset: presetFromScene,
        opacity: SCENE_DEFAULT_OPACITY[presetFromScene] ?? DEFAULT.opacity,
      };
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useStudioTheme(): {
  preset: StudioPreset;
  setPreset: (p: StudioPreset) => void;
  theme: StudioTheme;
  opacity: number;
  setOpacity: (n: number) => void;
  rootStyle: CSSProperties;
  bgType: StudioBgType;
  bgSrc: string | null;
  hasBg: boolean;
  canAdjustOpacity: boolean;
  opacityMin: number;
  opacityMax: number;
  opacityLabel: string;
} {
  // 首帧同步读取 localStorage（初始化器在客户端同步执行，SSR 走 DEFAULT）
  // 避免 useEffect → setState 的两阶段渲染闪屏
  const [preset, setPresetState] = useState<StudioPreset>(() => readInitialPersisted().preset);
  const [opacity, setOpacityState] = useState<number>(() => {
    const initial = readInitialPersisted();
    const fixed = FIXED_OPACITY_PRESETS[initial.preset];
    if (fixed !== undefined) return fixed;
    const range = OPACITY_RANGE_PRESETS[initial.preset];
    if (range && (initial.opacity < range.min || initial.opacity > range.max)) return range.default;
    return initial.opacity;
  });

  // 回写 localStorage（preset / opacity 变化时）
  useEffect(() => {
    try {
      const fixedOpacity = FIXED_OPACITY_PRESETS[preset];
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, opacity: fixedOpacity ?? opacity }));
    } catch {
      /* ignore */
    }
  }, [preset, opacity]);

  const config = useMemo(() => PRESET_MAP[preset], [preset]);
  const theme = config.theme;
  const bgType = config.bgType;
  const bgSrc = config.bgSrc;
  const hasBg = config.hasBg;

  const fixedOpacity = FIXED_OPACITY_PRESETS[preset];
  const rangeConfig = OPACITY_RANGE_PRESETS[preset];
  const canAdjustOpacity = !fixedOpacity;
  const opacityMin = rangeConfig?.min ?? 0;
  const opacityMax = rangeConfig?.max ?? 100;
  const opacityLabel = rangeConfig?.label ?? "透明度";

  /**
   * 透明度语义：
   * opacity(%) = 面板透出背景的比例：100% = 面板全透明，0% = 面板纯底色
   * panel-surface alpha = 1 - opacity/100
   * header alpha = 1 - max(0, (opacity - 15)) / 100  （顶栏多 15% 保护）
   *
   * 纯色套餐（无背景）：面板与顶栏完全不透明，忽略 opacity
   * 固定透明度套餐：使用固定值，不允许调整
   */
  const rootStyle: CSSProperties = useMemo(() => {
    const effectiveOpacity = fixedOpacity ?? opacity;
    const alpha = hasBg ? 1 - effectiveOpacity / 100 : 1;
    const headerAlpha = hasBg ? 1 - Math.max(0, effectiveOpacity - 15) / 100 : 1;
    return {
      ["--studio-theme" as any]: theme,
      ...(bgType === "image" && bgSrc ? { ["--studio-bg-url" as any]: `url(${bgSrc})` } : {}),
      ["--studio-opacity-raw" as any]: `${effectiveOpacity}`,
      ["--studio-surface-alpha" as any]: `${alpha}`,
      ["--studio-header-alpha" as any]: `${headerAlpha}`,
    };
  }, [theme, bgType, bgSrc, opacity, hasBg, fixedOpacity]);

  function setPreset(p: StudioPreset) {
    setPresetState(p);
    const fixed = FIXED_OPACITY_PRESETS[p];
    if (fixed !== undefined) {
      setOpacityState(fixed);
    } else {
      const range = OPACITY_RANGE_PRESETS[p];
      if (range && (opacity < range.min || opacity > range.max)) {
        setOpacityState(range.default);
      }
    }
  }
  function setOpacity(n: number) {
    if (fixedOpacity !== undefined) return; // 固定透明度套餐不允许调整
    const min = rangeConfig?.min ?? 0;
    const max = rangeConfig?.max ?? 100;
    setOpacityState(Math.min(max, Math.max(min, Math.round(n))));
  }

  return {
    preset,
    setPreset,
    theme,
    opacity,
    setOpacity,
    rootStyle,
    bgType,
    bgSrc,
    hasBg,
    canAdjustOpacity,
    opacityMin,
    opacityMax,
    opacityLabel,
  };
}
