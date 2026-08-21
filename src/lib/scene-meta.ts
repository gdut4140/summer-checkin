/**
 * 场景元数据：纯类型 + 纯数据 + 纯函数。
 *
 * 这个文件故意不写 "use client"，让 Server 与 Client 两端都能安全 import：
 *   - Server Action（如 dailyCheckin）需要 getSceneCopy / SceneType
 *   - Client 组件 & SceneContext 也需要同一份 SceneCopy 映射
 *
 * 若要新增场景，同步改：
 *   1) SceneType 字面量
 *   2) SCENE_COPY（文案）
 *   3) src/config/theme.ts 的 SCENE_THEMES（色板）
 *   4) src/app/globals.css 的 [data-scene="xxx"]（CSS 变量）
 *   5) src/components/island/scene-selector.tsx（缩略图卡片）
 */

export type SceneType = "rain" | "snow" | "cloud";

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

/** 默认场景（当 localStorage / 接口读取值非法时兜底） */
export const DEFAULT_SCENE: SceneType = "rain";

/** localStorage 存储 key（由 SceneProvider 与其他读写处共享） */
export const SCENE_STORAGE_KEY = "summer-checkin-scene";

/** 从任意输入安全地收敛为 SceneType，兜底返回 DEFAULT_SCENE */
export function asSceneType(v: unknown): SceneType {
  return v === "rain" || v === "snow" || v === "cloud" ? v : DEFAULT_SCENE;
}

/** 纯函数版：拿某个 scene 对应的文案（非 React 环境用；Server Action、工具函数都用它） */
export function getSceneCopy(scene: SceneType): SceneCopy {
  return SCENE_COPY[scene];
}
