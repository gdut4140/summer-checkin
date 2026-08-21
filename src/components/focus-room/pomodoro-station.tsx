"use client";

import { useRef, useState } from "react";
import { FocusTimer, type PomodoroHandle } from "./focus-timer";

const focusPresets = [25, 45, 60];

export function PomodoroStation({
  immersive = false,
  onStart,
}: {
  immersive?: boolean;
  onStart?: () => void;
}) {
  const timerRef = useRef<PomodoroHandle>(null);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const breakMinutes = 5;

  if (immersive) {
    return (
      <FocusTimer
        ref={timerRef}
        focusMinutes={focusMinutes}
        breakMinutes={breakMinutes}
        onRestoreFocusMinutes={setFocusMinutes}
        immersive
      />
    );
  }

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-2 flex items-center rounded-md border border-white/10 bg-black/10 p-1">
        {focusPresets.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setFocusMinutes(minutes)}
            className={
              focusMinutes === minutes
                ? "rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "rounded px-3 py-1.5 text-xs text-white/55 transition hover:text-white"
            }
          >
            {minutes} 分钟
          </button>
        ))}
      </div>
      <div className="px-3 py-3 sm:px-8 sm:py-5">
        <FocusTimer
          ref={timerRef}
          focusMinutes={focusMinutes}
          breakMinutes={breakMinutes}
          onRestoreFocusMinutes={setFocusMinutes}
          onStart={onStart}
        />
      </div>
    </div>
  );
}
