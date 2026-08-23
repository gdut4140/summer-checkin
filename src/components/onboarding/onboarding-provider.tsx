"use client";

// ============================================================
// 新手引导 Provider（driver.js）
// - 按页面分段播放，段间用 router.push 跳页接续；流程顺序见 tour-steps.ts 的
//   TOUR_ROUTE_ORDER（dashboard → checkin → plans → docs → statistics）
// - 引导从"当前所在页面"开始讲起：你在文档页触发，就先讲文档页再往后走；
//   新用户首次登录落在 /dashboard，因此自动播放完整流程
// - 看过一次后不再自动出现（localStorage 按 userId + 版本号记忆），
//   顶栏用户菜单提供"新手引导"入口可随时重看
// - 外观完全跟随场景主题色（--theme-primary / --surface-*），见 styles/onboarding.css
// ============================================================

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "@/styles/onboarding.css";
import {
  TOUR_SEGMENTS,
  TOUR_STEP_INDEX,
  TOUR_TOTAL_STEPS,
  TOUR_VERSION,
  nextPageOf,
  type TourStepConfig,
} from "./tour-steps";

interface OnboardingContextValue {
  /** 播放新手引导：从当前所在页面开始讲起（该页无引导段则回 /dashboard 从头讲） */
  startTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const STORAGE_PREFIX = "summer-checkin.tour";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${TOUR_VERSION}.${userId}`;
}

function hasSeen(userId: string) {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markSeen(userId: string) {
  try {
    window.localStorage.setItem(storageKey(userId), "1");
  } catch {
    // 隐私模式等场景忽略
  }
}

/** 主题背景色（雨林墨绿 / 雪景冰蓝 / 暖云深灰），用作遮罩主色 */
function themeOverlayColor() {
  if (typeof window === "undefined") return "#000000";
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--theme-background").trim();
  return bg || "#000000";
}

/** 等目标选择器出现在 DOM 中（跨页跳转后 server 组件可能仍在加载） */
function waitForSelector(selector: string, timeout = 4000): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) return resolve();
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeout);
  });
}

/** 解析目标元素：不在 DOM 或不可见（display:none / 无尺寸，如移动端隐藏的导航）→ undefined，
 *  由 driver.js 退化为全屏居中弹层，保证引导在窄屏也能完整播放 */
function resolveElement(selector: string): Element | undefined {
  const el = document.querySelector(selector);
  if (!el) return undefined;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return el;
}

export function OnboardingProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const activeRef = useRef(false); // 整个引导是否在播放（跨渲染）
  const navigatingRef = useRef(false); // 段间跳页中（销毁 driver 时不标记"已看过"）
  const pendingRouteRef = useRef<string | null>(null); // 跳页后待接续的页面
  const autoStartedRef = useRef(false);

  const removeNavExpand = useCallback(() => {
    document.querySelector(".atomic-nav")?.classList.remove("atomic-nav--tour");
  }, []);

  const cleanup = useCallback(() => {
    removeNavExpand();
    driverRef.current?.destroy();
    driverRef.current = null;
    activeRef.current = false;
  }, [removeNavExpand]);

  /** 按当前页面构建 driver（元素缺失自动退化为居中弹层） */
  const buildDriver = useCallback(
    (page: string) => {
      const segment = TOUR_SEGMENTS[page] ?? [];
      const nextPage = nextPageOf(page); // 当前页之后是否还有引导页（null 表示已是最后一站）
      const steps: DriveStep[] = segment.map((cfg: TourStepConfig, idx) => {
        const isLastOfSegment = idx === segment.length - 1;
        return {
          element: cfg.selector ? resolveElement(cfg.selector) : undefined,
          data: cfg.data,
          popover: {
            title: cfg.title,
            description: cfg.description,
            side: cfg.side,
            align: cfg.align,
            showProgress: true,
            progressText: `${TOUR_STEP_INDEX.get(cfg) ?? 0} / ${TOUR_TOTAL_STEPS}`,
            // 段落末步若后面还有引导页，driver.js 会把最后一步渲染成"完成"按钮——
            // 这里把文案换回"下一步"，并在 onDoneClick 里跳页；真正最后一步才是"完成"
            doneBtnText: isLastOfSegment && nextPage ? "下一步" : undefined,
          },
        };
      });

      /** 段间跳页：销毁当前 driver（不标记 seen），跳转后由 pathname 监听接续 */
      const navigateAway = (target: string) => {
        navigatingRef.current = true;
        driverRef.current?.destroy();
        driverRef.current = null;
        pendingRouteRef.current = target;
        router.push(target);
      };

      const d = driver({
        steps,
        animate: true,
        overlayColor: themeOverlayColor(),
        overlayOpacity: 0.72,
        smoothScroll: true,
        allowClose: true,
        disableActiveInteraction: true, // 引导期间禁止误点被高亮的元素（如沉浸模式按钮）
        showButtons: ["next", "previous", "close"],
        showProgress: true,
        nextBtnText: "下一步",
        prevBtnText: "上一步",
        doneBtnText: "完成",
        popoverClass: "tour-popover",
        onHighlightStarted: (_el, step, opts) => {
          if (step.data?.expandNav) {
            document.querySelector(".atomic-nav")?.classList.add("atomic-nav--tour");
            // 展开瞬间重算高亮裁切位置（.atomic-nav--tour 已禁用过渡，尺寸即时生效）
            requestAnimationFrame(() => opts.driver.refresh());
          }
        },
        onDeselected: (_el, step) => {
          if (step.data?.expandNav) removeNavExpand();
        },
        onNextClick: () => {
          // 段内前进（当前页内部的多步）
          driverRef.current?.moveNext();
        },
        onDoneClick: () => {
          // 段落末步：后面还有引导页就跳过去接续，否则整个引导收尾
          if (nextPage) {
            navigateAway(nextPage);
            return;
          }
          // 最后一站点"完成"：标记已看过并收尾
          markSeen(userId);
          cleanup();
        },
        onDestroyed: () => {
          // 任何方式销毁后：复位状态、清理导航展开；非段间跳页都视为"看过"。
          // 注意不能依赖 onDestroyStarted：它是拦截钩子，回调里不调 destroy() 会
          // 导致引导永远关不掉（点 X / Esc / 完成都无反应）。
          activeRef.current = false;
          driverRef.current = null;
          removeNavExpand();
          if (!navigatingRef.current) markSeen(userId);
        },
      });
      return d;
    },
    [router, removeNavExpand, cleanup, userId],
  );

  /** 在指定页面开始引导段落 */
  const beginSegment = useCallback(
    async (page: string) => {
      activeRef.current = true;
      // 等页面第一个目标元素渲染出来，避免跨页跳转后元素未就绪导致高亮落空
      const first = (TOUR_SEGMENTS[page] ?? []).find((s) => s.selector);
      if (first?.selector) {
        await waitForSelector(first.selector);
      }
      if (!activeRef.current) return; // 等待期间已被清理/关闭
      const d = buildDriver(page);
      driverRef.current = d;
      d.drive();
    },
    [buildDriver],
  );

  // 始终读最新的 pathname（供稳定版 startTour 使用，避免把变化值写进依赖）
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  /** 播放引导：总是从 /dashboard 重走完整流程（无论当前在哪个页面） */
  const startTour = useCallback(() => {
    if (activeRef.current) return; // 已在播放
    cleanup();
    navigatingRef.current = false;
    const current = pathnameRef.current;
    if (current === "/dashboard") {
      void beginSegment("/dashboard");
      return;
    }
    pendingRouteRef.current = "/dashboard";
    router.push("/dashboard");
  }, [router, cleanup, beginSegment]);

  // 路径变化：接续跳页段落 / 首次挂载自动播放
  useEffect(() => {
    if (pendingRouteRef.current && pendingRouteRef.current === pathname) {
      const page = pendingRouteRef.current;
      pendingRouteRef.current = null;
      navigatingRef.current = false;
      void beginSegment(page);
      return;
    }

    // 引导播放中被其他方式跳页（浏览器返回 / 点链接等）→ 收尾并视为已看过
    if (activeRef.current) {
      cleanup();
    }

    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      if (!hasSeen(userId)) {
        // 首屏多等一拍（背景视频 / 组件挂载），再自动开始
        const t = window.setTimeout(() => startTour(), 900);
        return () => window.clearTimeout(t);
      }
    }
  }, [pathname, startTour, beginSegment, cleanup, userId]);

  // 卸载时清理
  useEffect(() => {
    return () => {
      removeNavExpand();
      driverRef.current?.destroy();
    };
  }, [removeNavExpand]);

  return (
    <OnboardingContext.Provider value={{ startTour }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
