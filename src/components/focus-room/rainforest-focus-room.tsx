"use client";

import { useEffect, useState } from "react";
import { ArrowsOut } from "@phosphor-icons/react";
import { PomodoroStation } from "./pomodoro-station";
import { LocalTodoPanel } from "./local-todo-panel";
import { LongPressExit } from "./long-press-exit";
import { randomQuote } from "@/lib/quotes";
import { useScene, useSceneCopy } from "@/context/scene-context";

export function RainforestFocusRoom() {
  const [immersive, setImmersive] = useState(false);
  const { scene } = useScene();
  const { roomTitle, roomSlogan } = useSceneCopy();
  const [quote, setQuote] = useState(() => randomQuote(scene));

  // 挂到 body 上复用 .rainforest-immersive 规则：隐藏顶部导航 / 悬浮球 / 环境音，并锁定滚动
  useEffect(() => {
    if (immersive) document.body.classList.add("rainforest-immersive");
    else document.body.classList.remove("rainforest-immersive");
    return () => document.body.classList.remove("rainforest-immersive");
  }, [immersive]);

  function enterImmersive() {
    setQuote(randomQuote(scene));
    // 沉浸覆盖层是透明的，进入前先让当前输入框失焦，避免页面光标的闪烁透过覆盖层显示
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    setImmersive(true);
  }

  if (immersive) {
    return (
      <div className="fixed inset-0 z-[60] flex select-none flex-col items-center justify-center px-6">
        <PomodoroStation immersive />
        <p className="mt-10 max-w-md cursor-default text-center text-sm font-light leading-relaxed tracking-wide text-primary/55">
          「{quote}」
        </p>
        <LongPressExit onExit={() => setImmersive(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-8">
      {/* 标题 */}
      <header className="product-header shrink-0">
        <div>
          <p className="product-eyebrow">Deep focus</p>
          <h1 className="product-title">{roomTitle}</h1>
          <p className="product-subtitle">{roomSlogan}</p>
        </div>
        <button
          type="button"
          data-tour="focus-immersive"
          onClick={enterImmersive}
          className="flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-[1.03] hover:bg-primary/90 active:scale-95"
        >
          <ArrowsOut className="size-4" weight="bold" />
          沉浸模式
        </button>
      </header>

      {/* 三栏：番茄钟 | 背景 | 待办 */}
      <div className="flex flex-1 items-center gap-0">
        <div className="flex w-1/4 shrink-0 items-center px-2">
          <PomodoroStation onStart={enterImmersive} />
        </div>
        <div className="flex-1" />
        <div className="w-1/5 shrink-0 px-2">
          <LocalTodoPanel />
        </div>
      </div>
    </div>
  );
}
