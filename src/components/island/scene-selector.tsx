"use client";

import { useScene, type SceneType } from "@/context/scene-context";
import { Check } from "@phosphor-icons/react/dist/ssr";

interface SceneOption {
  id: SceneType;
  label: string;
  hint: string;
  bgStyle: React.CSSProperties;
}

const SCENES: SceneOption[] = [
  {
    id: "rain",
    label: "雨林",
    hint: "雨林视频背景",
    bgStyle: {
      background:
        "linear-gradient(135deg, #0a3d2e 0%, #134e3a 30%, #1e6b52 60%, #2d8a6b 100%)",
      boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
    },
  },
  {
    id: "snow",
    label: "雪景",
    hint: "冬日雪景背景",
    bgStyle: {
      backgroundImage: "url('/snow.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
  },
  {
    id: "cloud",
    label: "云天",
    hint: "云层阳光背景",
    bgStyle: {
      backgroundImage: "url('/cloud.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
  },
];

export function SceneSelector() {
  const { scene, setScene } = useScene();

  return (
    <div className="pointer-events-auto">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-medium text-white/60 md:text-xs">
          场景选择
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
        {SCENES.map((opt) => {
          const active = scene === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setScene(opt.id)}
              className={`group relative overflow-hidden rounded-xl transition-all duration-300 ${
                active
                  ? "ring-2 ring-primary/80 ring-offset-1 ring-offset-transparent scale-105"
                  : "opacity-70 hover:opacity-100 hover:scale-[1.02]"
              }`}
              aria-label={`切换到${opt.label}场景`}
              title={opt.hint}
            >
              {/* 缩略图（缩小形式作为选项） */}
              <div className="h-12 w-20 md:h-14 md:w-24 overflow-hidden rounded-xl bg-black/40">
                <div
                  className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                  style={opt.bgStyle}
                />
              </div>

              {/* 标签 */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-2">
                <p className="truncate text-[10px] font-medium text-white md:text-[11px]">
                  {opt.label}
                </p>
              </div>

              {/* 选中标记 */}
              {active && (
                <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Check className="h-3 w-3" weight="bold" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
