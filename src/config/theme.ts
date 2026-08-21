/**
 * 场景主题配置
 * ------------------------------------------------------------------
 * 实际生效的 CSS 变量定义在 globals.css 中，通过 [data-scene="xxx"] 选择器切换。
 * 此文件用于：
 *   1. 集中记录每个场景的配色设计意图，方便维护和新增场景
 *   2. TypeScript 侧可消费的主题元数据（如图表色、强调色）
 *
 * 关于 SceneType / SceneCopy / SCENE_COPY 的归属
 *   类型与文案都已统一移动到 @/lib/scene-meta（纯 TS 文件，无 'use client'），
 *   以便 Server Action 与 Client 组件两端都能安全引用。
 *   本文件从那里 re-export，保留历史引用路径。
 *
 * 新增场景步骤：
 *   1. 在 `@/lib/scene-meta` 的 SceneType 联合类型中加新标识（如 "beach"）
 *   2. 在 `@/lib/scene-meta` 的 SCENE_COPY 补一套文案
 *   3. 在本文件 SCENE_THEMES 补一套色板
 *   4. 在 globals.css 中加 [data-scene="beach"] { --xxx: ... }
 *   5. 在 scene-selector.tsx 中加对应缩略图卡片
 */

import { SCENE_COPY, type SceneCopy, type SceneType } from "@/lib/scene-meta";

// 向后兼容：仍允许从 @/config/theme 拿到 SceneType / SceneCopy / SCENE_COPY
export type { SceneType, SceneCopy };
export { SCENE_COPY };

export interface SceneThemeMeta {
  /** 显示名 */
  label: string;
  /** 主色（用于 JS 侧手动染色，如点击火花、图表等） */
  primary: string;
  /** 主色前景色（保证对比度） */
  primaryFg: string;
  /** 图表调色板（5 色） */
  chart: [string, string, string, string, string];
  /** 背景蒙层渐变（供参考，实际在 scene-overlay + globals.css） */
  overlayHint: string;
}

export const SCENE_THEMES: Record<SceneType, SceneThemeMeta> = {
  rain: {
    label: "雨林",
    primary: "#d7ef83",
    primaryFg: "#051612",
    chart: ["#d7ef83", "#c8b45a", "#d7ef83", "#e0886a", "#88b85a"],
    overlayHint: "墨绿暗色蒙层，顶底暗、中部稍亮",
  },
  snow: {
    label: "雪日",
    primary: "#d4e2f0", // 淡白蓝（白多蓝少，柔和）
    primaryFg: "#1e2a38", // 深灰蓝前景保证可读
    chart: ["#d4e2f0", "#dee8f3", "#c8d8ea", "#e8eef4", "#b8cce0"],
    overlayHint: "淡白蓝蒙层，整体偏白通透",
  },
  cloud: {
    label: "暖云",
    primary: "#e0e0e0", // 浅灰白（黑底白字主题）
    primaryFg: "#0a0a0a", // 纯黑前景，保证可读
    chart: ["#e0e0e0", "#c8c8c8", "#b0b0b0", "#989898", "#f0f0f0"],
    overlayHint: "纯黑暗灰蒙层，四角柔压，云朵整体偏暗",
  },
};
