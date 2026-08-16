"use client";

import { useRef, useState } from "react";

// 与 globals.css 中 .immersive-hold 动画时长保持一致
const HOLD_MS = 1400;

export function LongPressExit({ onExit }: { onExit: () => void }) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancel() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function start() {
    setHolding(true);
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onExit();
    }, HOLD_MS);
  }

  function end() {
    setHolding(false);
    cancel();
  }

  return (
    <button
      type="button"
      className={`immersive-exit touch-none${holding ? " is-holding" : ""}`}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      <span className="relative z-10">长按退出</span>
    </button>
  );
}
