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

/**
 * 场景专属文案（所有 UI 上显示的"雨林/雪日/暖云"类字符串都从这里读，避免硬编码散落在页面里）
 *
 * 每个字段语义约定（新增场景时按同样句式填）：
 *  - labelShort        ：场景选择器 / 顶栏 Tab 等窄空间显示名（1~2 字）
 *  - labelLong         ：标题/文档内需要更明确的长名（2~4 字）
 *  - roomTitle         ：首页 / 自习室大标题（4~6 字）
 *  - roomSlogan        ：标题下的副标题（一句氛围感短文案）
 *  - explorerTitle     ：智能体面板标题（4 字以内）
 *  - explorerSubtitle  ：智能体面板副标题说明
 *  - explorerButtonLabel ：打开智能体按钮的 tooltip / aria-label
 *  - footprintLabel    ：打卡页的「足迹」标题（4 字以内，用于"xxx足迹"等合成处可单独用）
 *  - footprintHeading  ：打卡页 Heatmap 上方的完整标题（如 "雨林足迹" / "雪日足迹"）
 *  - visitButtonLabel  ：首页打卡按钮主文案（4 字）
 *  - visitSuccessToast ：打卡成功 toast 主文案
 *  - visitRecordText   ：打卡记录里的动作文字（4 字，"到访雨林"）
 *  - sceneHint         ：场景选择卡片里的 hint 文案
 */
export interface SceneCopy {
  labelShort: string;
  labelLong: string;
  roomTitle: string;
  roomSlogan: string;
  explorerTitle: string;
  explorerSubtitle: string;
  explorerButtonLabel: string;
  footprintLabel: string;
  footprintHeading: string;
  visitButtonLabel: string;
  visitSuccessToast: string;
  visitRecordText: string;
  sceneHint: string;
}

export const SCENE_COPY: Record<SceneType, SceneCopy> = {
  rain: {
    labelShort: "雨林",
    labelLong: "雨林",
    roomTitle: "雨林自习室",
    roomSlogan: "在雨声中沉浸，让每一段专注都有节奏。",
    explorerTitle: "探索雨林",
    explorerSubtitle: "你的学习智能体",
    explorerButtonLabel: "打开探索雨林",
    footprintLabel: "足迹",
    footprintHeading: "雨林足迹",
    visitButtonLabel: "来访雨林",
    visitSuccessToast: "雨林又多了你的足迹 🌿",
    visitRecordText: "到访雨林",
    sceneHint: "雨林视频背景",
  },
  snow: {
    labelShort: "雪日",
    labelLong: "雪日",
    roomTitle: "雪日自习室",
    roomSlogan: "在雪落中入定，让每一段专注都安静而坚定。",
    explorerTitle: "漫步雪林",
    explorerSubtitle: "你的学习智能体",
    explorerButtonLabel: "打开漫步雪林",
    footprintLabel: "足迹",
    footprintHeading: "雪日足迹",
    visitButtonLabel: "来访雪日",
    visitSuccessToast: "雪地里又多了你的一串脚印 ❄️",
    visitRecordText: "到访雪日",
    sceneHint: "冬日雪景背景",
  },
  cloud: {
    labelShort: "暖云",
    labelLong: "暖云",
    roomTitle: "暖云自习室",
    roomSlogan: "在云影里舒展，让每一段专注都柔软而悠长。",
    explorerTitle: "云间漫游",
    explorerSubtitle: "你的学习智能体",
    explorerButtonLabel: "打开云间漫游",
    footprintLabel: "足迹",
    footprintHeading: "暖云足迹",
    visitButtonLabel: "来访暖云",
    visitSuccessToast: "云朵里又留下了你的印记 ☁️",
    visitRecordText: "到访暖云",
    sceneHint: "云层阳光背景",
  },
};

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
