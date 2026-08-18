/**
 * 场景主题配置
 * ------------------------------------------------------------------
 * 实际生效的 CSS 变量定义在 globals.css 中，通过 [data-scene="xxx"] 选择器切换。
 * 此文件用于：
 *   1. 集中记录每个场景的配色设计意图，方便维护和新增场景
 *   2. TypeScript 侧可消费的主题元数据（如图表色、强调色）
 *
 * 新增场景步骤：
 *   1. 在 SceneType 中加入新标识（如 "beach"）
 *   2. 在 SCENE_THEMES 补一套色板
 *   3. 在 globals.css 中加 [data-scene="beach"] { --xxx: ... }
 *   4. 在 scene-selector.tsx 中加对应缩略图卡片
 */

export type SceneType = "rain" | "snow" | "cloud";

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
    label: "雪景",
    primary: "#7dd3fc", // sky-300 冰蓝
    primaryFg: "#0c2a3a", // 深蓝前景保证可读
    chart: ["#7dd3fc", "#a5b4fc", "#67e8f9", "#c4b5fd", "#e0f2fe"],
    overlayHint: "冷灰蓝蒙层，整体偏白亮",
  },
  cloud: {
    label: "云天",
    primary: "#d6be98", // 柔和卡其（#cdb28a 再白一点，L 67%→70%，奶油白卡其）
    primaryFg: "#3e2f1a", // 深咖啡，保证可读
    chart: ["#d6be98", "#dec9a6", "#e6d4b4", "#c9ac7f", "#e6decb"],
    overlayHint: "卡其蒙层，四角柔压，云朵大面积通透",
  },
};
