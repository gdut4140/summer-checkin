// ============================================================
// 新手引导步骤配置（driver.js）
// 按页面分段：driver 只在"当前页面"渲染其步骤，段落播完后自动跳到
// 流程里的下一页（nextPageOf），由 OnboardingProvider 接续播放。
// 流程顺序见 TOUR_ROUTE_ORDER，引导可以"从当前所在页面"开始，
// 例如你正在文档页，触发引导就先讲文档页，再往后走。
// ============================================================

export type TourStepSide = "top" | "right" | "bottom" | "left";
export type TourStepAlign = "start" | "center" | "end";

export interface TourStepConfig {
  /** 标题 */
  title: string;
  /** 说明文案 */
  description: string;
  /** 高亮目标 CSS 选择器；缺省 → 全屏居中弹层（欢迎 / 收尾） */
  selector?: string;
  side?: TourStepSide;
  align?: TourStepAlign;
  data?: {
    /** 该步骤高亮期间把顶部原子导航展开（把隐藏的五个页面链接露出来） */
    expandNav?: boolean;
  };
}

/** 引导覆盖的页面（顺序即引导播放顺序；段落播完自动进下一页） */
export const TOUR_ROUTE_ORDER = [
  "/dashboard",
  "/checkin",
  "/plans",
  "/docs",
  "/statistics",
] as const;

/**
 * 步骤按页面分组；key 与 (dashboard) 路由路径一致。
 * 调整内容时把 TOUR_VERSION 升级（v2...），已看过旧版的用户会再看一遍新引导。
 */
export const TOUR_VERSION = "v1";

export const TOUR_SEGMENTS: Record<string, TourStepConfig[]> = {
  "/dashboard": [
    {
      title: "欢迎来到 Summer Checkin 🌱",
      description:
        "打卡 · 计划 · 阅读 · 专注——一个把学习节奏收拢到一起的栖息地。用几步带你逛一圈，马上就能上手。",
    },
    {
      title: "顶部导航",
      description:
        "专注 · 小岛 · 计划 · 阅读 · 主页，五个页面来回切换，你的学习都从这里出发。",
      selector: ".atomic-nav",
      side: "bottom",
      data: { expandNav: true },
    },
    {
      title: "沉浸专注",
      description:
        "点一下进入沉浸模式，隐藏所有干扰，只留番茄钟和白噪音。深度的学习状态，从这里开始。",
      selector: '[data-tour="focus-immersive"]',
      side: "bottom",
    },
  ],

  "/checkin": [
    {
      title: "场景切换",
      description:
        "雨林 · 雪景 · 暖云。选一个合眼缘的学习氛围，整个界面的主题色会跟着一起变。",
      selector: '[data-tour="scene-selector"]',
      side: "right",
    },
    {
      title: "每日打卡",
      description:
        "每次学习结束点一下，在小岛留下足迹、点亮热力图。把坚持变成一件很有手感的事。",
      selector: '[data-tour="checkin-button"]',
      side: "top",
    },
  ],

  "/plans": [
    {
      title: "学习计划",
      description:
        "把长期目标收拢成清晰、能执行的下一步，AI 还能帮你拆任务、定节奏。",
      selector: ".product-header",
      side: "bottom",
    },
  ],

  "/docs": [
    {
      title: "文档工作台",
      description:
        "新建文档、导入 Markdown，写下的内容还能加入知识库，让 AI 帮你阅读和修改。",
      selector: '[data-tour="docs-new"]',
      side: "bottom",
    },
  ],

  "/statistics": [
    {
      title: "学习数据",
      description:
        "加入天数、连续活跃、任务完成率……你在这里留下足迹，数据也会记住你的每一步努力。",
      selector: ".product-metrics",
      side: "bottom",
    },
    {
      title: "都准备好啦 ✨",
      description:
        "这就是全部啦！记得先完成今天的第一次打卡。任何时候点右上角头像 →「新手引导」都能再看一遍。",
    },
  ],
};

/** 当前页在引导流程里的"下一页"（最后一页返回 null，表示流程到此结束） */
export function nextPageOf(page: string): string | null {
  const idx = TOUR_ROUTE_ORDER.indexOf(page as (typeof TOUR_ROUTE_ORDER)[number]);
  if (idx === -1) return null;
  return TOUR_ROUTE_ORDER[idx + 1] ?? null;
}

/** 给每个静态步骤分配全局序号（跨段落连续计数，用于进度文案 "x / N"） */
export const TOUR_STEP_INDEX = new Map<TourStepConfig, number>();
{
  let i = 1;
  for (const page of TOUR_ROUTE_ORDER) {
    for (const step of TOUR_SEGMENTS[page] ?? []) {
      TOUR_STEP_INDEX.set(step, i++);
    }
  }
}

export const TOUR_TOTAL_STEPS = TOUR_STEP_INDEX.size;
