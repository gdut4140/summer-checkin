"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";

/**
 * SSR 期间没有 window，useLayoutEffect 会告警且不执行；服务端退化成 useEffect。
 * 客户端仍是 layout effect —— 这是「读 localStorage 又不闪屏」的关键。
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 允许 CSS 自定义属性（--x）的 style 对象。
 * React 的 CSSProperties 没有索引签名，直接写 `--foo` 会被判为多余属性，
 * 此前靠每处 `as any` 绕过。这里把自定义属性补进类型，去掉那些 any。
 */
export type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

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
  "dark-rain": { theme: "dark", bgType: "image", bgSrc: "/rain.webp", label: "雨林", hasBg: true },
  "light-snow": { theme: "dark", bgType: "image", bgSrc: "/snow.webp", label: "雪日", hasBg: true },
  "khaki-cloud": { theme: "dark", bgType: "image", bgSrc: "/cloud.webp", label: "暖云", hasBg: true }, // 黑底白字
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
 * 读取本地存储的主题偏好。
 *
 * **只能在挂载之后调用**（由 useStudioTheme 里的 layout effect 调），
 * 不能在 useState 初始化器里调——那会让客户端首帧与服务端不一致，触发 hydration 失败。
 * SSR / 非浏览器环境返回 DEFAULT。
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

/** 固定透明度 / 区间限制套餐 → 把存下来的透明度规整到合法值 */
function normalizeOpacity(preset: StudioPreset, opacity: number): number {
  const fixed = FIXED_OPACITY_PRESETS[preset];
  if (fixed !== undefined) return fixed;
  const range = OPACITY_RANGE_PRESETS[preset];
  if (range && (opacity < range.min || opacity > range.max)) return range.default;
  return opacity;
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
  /**
   * 首帧一律用 DEFAULT，**不能**在这里同步读 localStorage。
   *
   * 原因：服务端读不到 localStorage，只能渲染 DEFAULT；客户端首帧若直接读，
   * 两边渲染出的 preset 就不同（服务端「雨林」/ 客户端「暖云」），React 判定
   * hydration 失败并把这棵子树整个在客户端重建——控制台报 hydration mismatch，
   * 用户看到的还是一闪，等于两头不讨好。首次访问的用户跟随全局场景（cloud→暖云）
   * 时同样会踩到。
   *
   * 现在的做法：首帧与 SSR 一致 → 挂载后在 layout effect 里读并套用。
   * layout effect 在浏览器绘制前执行，中间态不会被画出来，所以既不报错也不闪。
   */
  const [persisted, setPersisted] = useState<Persisted>(DEFAULT);
  const { preset, opacity } = persisted;

  useIsomorphicLayoutEffect(() => {
    const initial = readInitialPersisted();
    const next: Persisted = {
      preset: initial.preset,
      opacity: normalizeOpacity(initial.preset, initial.opacity),
    };
    // 没存过主题时 next 与 DEFAULT 相同，避免白跑一次渲染
    setPersisted((prev) =>
      prev.preset === next.preset && prev.opacity === next.opacity ? prev : next
    );
  }, []);

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
  const rootStyle: CSSVarStyle = useMemo(() => {
    const effectiveOpacity = fixedOpacity ?? opacity;
    const alpha = hasBg ? 1 - effectiveOpacity / 100 : 1;
    const headerAlpha = hasBg ? 1 - Math.max(0, effectiveOpacity - 15) / 100 : 1;
    return {
      "--studio-theme": theme,
      ...(bgType === "image" && bgSrc ? { "--studio-bg-url": `url(${bgSrc})` } : {}),
      "--studio-opacity-raw": `${effectiveOpacity}`,
      "--studio-surface-alpha": `${alpha}`,
      "--studio-header-alpha": `${headerAlpha}`,
    };
  }, [theme, bgType, bgSrc, opacity, hasBg, fixedOpacity]);

  function setPreset(p: StudioPreset) {
    setPersisted((prev) => {
      const fixed = FIXED_OPACITY_PRESETS[p];
      if (fixed !== undefined) return { preset: p, opacity: fixed };
      const range = OPACITY_RANGE_PRESETS[p];
      if (range && (prev.opacity < range.min || prev.opacity > range.max)) {
        return { preset: p, opacity: range.default };
      }
      return { preset: p, opacity: prev.opacity };
    });
  }
  function setOpacity(n: number) {
    if (fixedOpacity !== undefined) return; // 固定透明度套餐不允许调整
    const min = rangeConfig?.min ?? 0;
    const max = rangeConfig?.max ?? 100;
    const next = Math.min(max, Math.max(min, Math.round(n)));
    setPersisted((prev) => (prev.opacity === next ? prev : { ...prev, opacity: next }));
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
