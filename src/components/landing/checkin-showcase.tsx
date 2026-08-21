"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  CaretDown,
  CloudSun,
  Leaf,
  Snowflake,
  Sparkle,
  Sun,
  Tree,
} from "@phosphor-icons/react";
import type { SceneType } from "@/lib/scene-meta";
import { SCENE_COPY } from "@/lib/scene-meta";

/* ---------- 三场景亮点卡片 ---------- */
interface SceneHighlight {
  id: SceneType;
  icon: typeof Leaf;
  accent: string;
  tagColor: string;
  title: string;
  subtitle: string;
  slogan: string;
}

const HIGHLIGHTS: SceneHighlight[] = [
  {
    id: "rain",
    icon: Leaf,
    accent: "#d7ef83",
    tagColor: "bg-[#d7ef83]/15 text-[#d7ef83]",
    title: "雨林场景",
    subtitle: "雨声白噪音 · 深墨绿调",
    slogan: "在雨声中沉浸，让每一段专注都有节奏。",
  },
  {
    id: "snow",
    icon: Snowflake,
    accent: "#c8d8e8",
    tagColor: "bg-[#c8d8e8]/15 text-[#c8d8e8]",
    title: "雪日场景",
    subtitle: "落雪氛围 · 淡白蓝调",
    slogan: "在雪落中入定，让每一段专注都安静而坚定。",
  },
  {
    id: "cloud",
    icon: CloudSun,
    accent: "#e6d3a8",
    tagColor: "bg-[#e6d3a8]/15 text-[#e6d3a8]",
    title: "暖云场景",
    subtitle: "云层阳光 · 卡其暖调",
    slogan: "在云影里舒展，让每一段专注都柔软而悠长。",
  },
];

/* ---------- 辅助：按 scene 取强调色 ---------- */
function accentOf(scene: SceneType): string {
  return HIGHLIGHTS.find((h) => h.id === scene)!.accent;
}

/* ---------- 每种场景对应的预览区配置（仅影响 16:10 预览卡内部） ---------- */
const PREVIEW_STYLES: Record<
  SceneType,
  {
    sceneImage: string;
    overlay: string;
    bottomTag: string;
    bottomIcon: typeof Tree;
    bottomLabel: string;
    sceneName: string;
  }
> = {
  rain: {
    sceneImage: "/rain.png",
    overlay:
      "bg-gradient-to-t from-[#051a13]/55 via-transparent to-[#092519]/30",
    bottomTag: "bg-white/5 text-white/30",
    bottomIcon: Tree,
    bottomLabel: "森林 · 雨天",
    sceneName: "雨林",
  },
  snow: {
    sceneImage: "/snow.png",
    overlay:
      "bg-gradient-to-t from-[#0c1a28]/55 via-transparent to-[#14283c]/25",
    bottomTag: "bg-white/5 text-[#c8d8e8]/50",
    bottomIcon: Snowflake,
    bottomLabel: "雪林 · 静谧",
    sceneName: "雪日",
  },
  cloud: {
    sceneImage: "/cloud.png",
    overlay:
      "bg-gradient-to-t from-[#3a2a14]/55 via-transparent to-[#4a3720]/25",
    bottomTag: "bg-[#e6d3a8]/10 text-[#e6d3a8]/60",
    bottomIcon: Sun,
    bottomLabel: "暖云 · 舒展",
    sceneName: "暖云",
  },
};

export function CheckinShowcase() {
  // ⚠️ 方案二：局部 previewScene，不与全局 SceneContext 同步
  //    → landing/登录注册页保持雨林主题不变（rain.mp4 背景）
  //    → 只在这个 showcase 的预览演示区切换三种场景视觉
  const [previewScene, setPreviewScene] = useState<SceneType>("rain");
  const pv = PREVIEW_STYLES[previewScene];
  const BottomIcon = pv.bottomIcon;
  const accent = accentOf(previewScene);

  return (
    // section 外壳固定雨林色，与 landing 其他 section（Hero / FeaturesGrid 等）色调一致
    <section id="checkin" className="border-y border-white/10 bg-[#051a13]/90 px-4 py-20 md:px-8 md:py-28 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          {/* 左侧 — 岛屿预览 + 场景预览演示 */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: accent }}
            >
              三种氛围 · 随心切换
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
              换一个场景，
              <br />
              换一种
              <span style={{ color: accent }}> 专注的心情</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/56">
              Summer Checkin 为你准备了雨林 / 雪日 / 暖云三种沉浸式场景，
              每种都带有专属配色、背景与氛围——不管今天想听雨、看雪还是看云，
              都能找到一个让你愿意坐下来的角落。
            </p>

            {/* 预览卡片：外框固定雨林色，内部 16:10 区域切换场景图片 */}
            <div className="mt-10 overflow-hidden rounded-lg border border-white/10 bg-[#07221a]">
              <div className="relative aspect-[16/10] w-full overflow-hidden">
                {/* 场景背景图，铺满盒子 */}
                <img
                  src={pv.sceneImage}
                  alt={pv.sceneName}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* 氛围遮罩（场景预览） */}
                <div
                  className={`pointer-events-none absolute inset-0 ${pv.overlay}`}
                />

                {/* 场景选择器（左上角）— 方案二：缩略图用 rain.png / snow.png / cloud.png */}
                <div className="absolute left-4 top-4 pointer-events-auto">
                  <InlineSceneSwitcher
                    current={previewScene}
                    onChange={setPreviewScene}
                  />
                </div>

                {/* 右上角：当前预览场景 */}
                <div
                  className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`,
                    color: accent,
                  }}
                >
                  <Sparkle className="size-3" weight="fill" />
                  预览：{SCENE_COPY[previewScene].labelLong}
                </div>

                {/* 左下角场景氛围标签 */}
                <div
                  className={`absolute bottom-3 left-4 flex items-center gap-2 text-[11px] rounded-full px-2.5 py-1 ${pv.bottomTag}`}
                >
                  <BottomIcon className="size-3" />
                  {pv.bottomLabel}
                </div>
              </div>

              {/* 底部三栏信息 */}
              <div className="flex border-t border-white/10">
                <MiniStat label="场景" value={pv.sceneName} />
                <MiniStat
                  label="氛围"
                  value={
                    previewScene === "rain"
                      ? "沉浸节奏"
                      : previewScene === "snow"
                      ? "安静坚定"
                      : "柔软悠长"
                  }
                />
                <MiniStat label="专属配色" value={pv.sceneName} />
              </div>
            </div>
          </motion.div>

          {/* 右侧 — 三场景亮点卡片（点击只切换局部 preview） */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:pl-6"
          >
            <div className="space-y-4">
              {HIGHLIGHTS.map((h, i) => {
                const active = previewScene === h.id;
                const ItemIcon = h.icon;
                return (
                  <motion.button
                    key={h.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    onClick={() => setPreviewScene(h.id)}
                    className={`group w-full rounded-lg border p-5 text-left transition-all duration-300 ${
                      active
                        ? "border-white/20 bg-white/[0.06] shadow-lg"
                        : "border-white/10 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* 图标 */}
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${h.accent} 14%, transparent)`,
                          boxShadow: active
                            ? `0 0 0 1px color-mix(in srgb, ${h.accent} 45%, transparent), 0 10px 24px -10px ${h.accent}40`
                            : undefined,
                        }}
                      >
                        <ItemIcon
                          className="size-5"
                          weight="duotone"
                          style={{ color: h.accent }}
                        />
                      </div>

                      {/* 文字 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-white">
                            {h.title}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${h.tagColor}`}
                          >
                            {h.subtitle}
                          </span>
                          {active && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
                              预览中
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-white/58">
                          {h.slogan}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <p className="mt-6 text-center text-xs text-white/28">
              进入学习空间后，你可以在顶栏随时切换这三种场景。
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 小组件：底部三栏 ---------- */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 items-center gap-2 px-4 py-3">
      <div>
        <p className="truncate text-sm font-semibold text-white">{value}</p>
        <p className="text-[10px] text-white/35">{label}</p>
      </div>
    </div>
  );
}

/* ---------- 小组件：预览卡左上角的场景切换器（用 rain.png / snow.png / cloud.png 缩略图） ---------- */
function InlineSceneSwitcher({
  current,
  onChange,
}: {
  current: SceneType;
  onChange: (s: SceneType) => void;
}) {
  const items: { id: SceneType; thumb: string; label: string }[] = [
    { id: "rain", thumb: "/rain.png", label: SCENE_COPY.rain.labelShort },
    { id: "snow", thumb: "/snow.png", label: SCENE_COPY.snow.labelShort },
    { id: "cloud", thumb: "/cloud.png", label: SCENE_COPY.cloud.labelShort },
  ];

  return (
    <div className="pointer-events-auto">
      <div className="mb-1.5 text-[10px] font-medium text-white/55 md:text-[11px]">
        切换场景
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/35 p-1.5 backdrop-blur-xl">
        {items.map((it) => {
          const active = current === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className={`group relative overflow-hidden rounded-lg transition-all duration-300 ${
                active
                  ? "ring-2 ring-white/70 ring-offset-1 ring-offset-transparent scale-105"
                  : "opacity-70 hover:opacity-100"
              }`}
              aria-label={`切换到${it.label}场景`}
            >
              <div className="h-9 w-14 overflow-hidden rounded-lg bg-black/50 md:h-10 md:w-16">
                <div
                  className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                  style={{ backgroundImage: `url('${it.thumb}')` }}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-1">
                <p className="truncate text-center text-[9px] font-medium text-white md:text-[10px]">
                  {it.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
