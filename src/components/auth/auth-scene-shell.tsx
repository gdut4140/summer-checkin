"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Leaf, ShieldCheck, TrendUp, Sparkle } from "@phosphor-icons/react";
import { SCENE_STORAGE_KEY, DEFAULT_SCENE, asSceneType, type SceneType } from "@/lib/scene-meta";

// ─── 每个场景的登录页专属视觉配置 ───
interface SceneAuthVisual {
  /** 外层容器纯色兜底背景（素材加载前也不会闪错色） */
  wrapperBg: string;
  /** 桌面端左侧背景视频源；不设则走图片方案 */
  videoSrc?: string;
  /** 桌面端左侧背景图片源（雪日 / 暖云用） */
  imageSrc?: string;
  /** 视频/图片 上的遮罩渐变，保证文字可读 */
  overlayGradient: string;
  /** 移动端遮罩浓度（移动端素材直接平铺，遮罩更重） */
  mobileOverlayClass: string;
  /** 左栏 hero 标题颜色（为了匹配场景氛围） */
  heroHeadingAccent: string;
  /** slogan 文字颜色 */
  heroSloganClass: string;
  /** 特性 / 底部小文字颜色 */
  heroMutedClass: string;
}

const SCENE_VISUALS: Record<SceneType, SceneAuthVisual> = {
  rain: {
    wrapperBg: "bg-[#06150f]",
    imageSrc: "/rain.webp",
    overlayGradient: "from-[#06150f]/72 via-[#06150f]/48 to-[#06150f]/82",
    mobileOverlayClass: "bg-[#06150f]/85",
    heroHeadingAccent: "text-primary",
    heroSloganClass: "text-white/60",
    heroMutedClass: "text-white/40",
  },
  snow: {
    wrapperBg: "bg-[#0c1a28]",
    imageSrc: "/snow.webp",
    overlayGradient: "from-[#0c1a28]/70 via-[#0c1a28]/42 to-[#0c1a28]/86",
    mobileOverlayClass: "bg-[#0c1a28]/88",
    heroHeadingAccent: "text-[#d4e2f0]",
    heroSloganClass: "text-white/52",
    heroMutedClass: "text-white/36",
  },
  cloud: {
    wrapperBg: "bg-[#1f2736]",
    imageSrc: "/cloud.webp",
    overlayGradient: "from-[#1f2736]/70 via-[#1f2736]/44 to-[#1f2736]/84",
    mobileOverlayClass: "bg-[#1f2736]/88",
    heroHeadingAccent: "text-[#e0d4b8]",
    heroSloganClass: "text-white/52",
    heroMutedClass: "text-white/34",
  },
};

const SCENE_HERO_COPY: Record<
  SceneType,
  { eyebrow: string; title: [string, string]; slogan: string; mutedA: string; mutedB: string }
> = {
  rain: {
    eyebrow: "雨林 · 你的学习栖息地",
    title: ["让每一次专注", "都留下生长的痕迹"],
    slogan: "计划、专注、打卡，与 AI 伙伴雨宝协作，在安静的森林里完成每一天的学习。",
    mutedA: "数据只属于你",
    mutedB: "看见持续的进步",
  },
  snow: {
    eyebrow: "雪日 · 你的安静自习室",
    title: ["让每一次专注", "都安静而坚定"],
    slogan: "在雪落中入定，与 AI 伙伴雨宝一起，按自己的节奏推进计划和打卡。",
    mutedA: "数据只属于你",
    mutedB: "看见持续的进步",
  },
  cloud: {
    eyebrow: "暖云 · 你的柔软自习室",
    title: ["让每一次专注", "都柔软而悠长"],
    slogan: "在云影里舒展，与 AI 伙伴雨宝一起，把计划、记录、专注都做得更松弛一点。",
    mutedA: "数据只属于你",
    mutedB: "看见持续的进步",
  },
};

export function AuthSceneShell({ children }: { children: React.ReactNode }) {
  // 首帧与服务端一致渲染默认场景，挂载后再从 localStorage 同步（与 SceneProvider 一致，避免 hydration 不匹配）
  const [scene, setSceneState] = useState<SceneType>(DEFAULT_SCENE);

  // 1) 监听 localStorage 变化（别的 Tab 改了，此处也跟着变）
  // 2) 首次挂载如果 data-scene 不一致，主动同步（保证 CSS 变量生效）
  useEffect(() => {
    const syncFromStorage = () => {
      const next = asSceneType(
        typeof window !== "undefined" ? window.localStorage.getItem(SCENE_STORAGE_KEY) : null,
      );
      setSceneState((prev) => (prev === next ? prev : next));
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (root.dataset.scene !== next) root.dataset.scene = next;
      }
    };
    syncFromStorage();
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const vis = SCENE_VISUALS[scene];
  const copy = SCENE_HERO_COPY[scene];

  return (
    <div className={`relative flex min-h-[100dvh] items-stretch overflow-hidden ${vis.wrapperBg}`}>
      {/* 左侧 — 视频 / 图片 背景（仅大屏展示） */}
      <section className="relative hidden min-h-[100dvh] flex-1 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        {vis.videoSrc ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={vis.videoSrc} type="video/mp4" />
          </video>
        ) : vis.imageSrc ? (
          <div
            className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${vis.imageSrc}")` }}
          />
        ) : null}

        {/* 遮罩 — 让文字可读 */}
        <div className={`absolute inset-0 bg-gradient-to-br ${vis.overlayGradient}`} />

        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2.5 text-base font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Leaf className="h-5 w-5" weight="fill" />
            </span>
            Summer <span className="-ml-1 text-primary">Checkin</span>
          </Link>

          {/* 主文案 */}
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Sparkle className="size-3" weight="fill" />
              <span>{copy.eyebrow}</span>
            </div>
            <h1 className="mt-5 max-w-xl text-[42px] font-semibold leading-[1.15] tracking-tight text-white drop-shadow-lg xl:text-[48px]">
              {copy.title[0]}
              <br />
              <span className={vis.heroHeadingAccent}>{copy.title[1]}</span>
            </h1>
            <p className={`mt-5 max-w-md text-[15px] leading-7 drop-shadow ${vis.heroSloganClass}`}>
              {copy.slogan}
            </p>
          </div>

          {/* 底部：返回产品进入页 + 特性 */}
          <div className="flex flex-col gap-5">
            <Link
              href="/"
              className="group inline-flex w-fit items-center gap-2 rounded-full border-2 border-primary-foreground bg-primary px-5 py-2 text-[13px] font-bold text-primary-foreground shadow-[0_0_0_0_var(--primary-foreground,#051612)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:translate-x-[-2px] hover:shadow-[4px_6px_0_0_var(--primary-foreground,#051612)] active:translate-y-0.5 active:translate-x-[1px] active:shadow-[0_0_0_0_var(--primary-foreground,#051612)]"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" weight="bold" />
              返回产品进入页
            </Link>
            <div className={`flex gap-6 text-[12px] ${vis.heroMutedClass}`}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" />
                {copy.mutedA}
              </span>
              <span className="flex items-center gap-1.5">
                <TrendUp className="size-4 text-primary/70" />
                {copy.mutedB}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 右侧 — 表单（窄列）。bg-background 读自 [data-scene] 对应主题 CSS 变量 */}
      <section className="relative flex min-h-[100dvh] w-full items-center overflow-hidden bg-background lg:w-[480px] lg:shrink-0 xl:w-[520px]">
        {/* 移动端背景素材（与左侧同风格） */}
        {vis.videoSrc ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover lg:hidden"
          >
            <source src={vis.videoSrc} type="video/mp4" />
          </video>
        ) : vis.imageSrc ? (
          <div
            className="absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat lg:hidden"
            style={{ backgroundImage: `url("${vis.imageSrc}")` }}
          />
        ) : null}
        <div className={`absolute inset-0 ${vis.mobileOverlayClass} lg:hidden`} />

        {/* Mobile logo */}
        <Link href="/" className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 text-sm font-semibold text-white lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="size-4" weight="fill" />
          </span>
          Summer Checkin
        </Link>

        {/* 表单容器 */}
        <div className="relative z-10 w-full px-5 py-24 sm:px-10 lg:px-12 lg:py-16">
          <div className="mx-auto w-full max-w-[360px] px-1 sm:px-0">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
