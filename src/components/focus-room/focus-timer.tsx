"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Play, Pause, SkipForward, ArrowCounterClockwise } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type TimerMode = "focus" | "break";

export interface PomodoroHandle {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  getIsRunning: () => boolean;
  getMode: () => TimerMode;
}

interface FocusTimerProps {
  focusMinutes?: number;
  breakMinutes?: number;
  onRestoreFocusMinutes?: (minutes: number) => void;
  immersive?: boolean;
  /** 非沉浸模式下点击"开始"时触发，用于让父组件进入沉浸模式 */
  onStart?: () => void;
}

const RING_RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SVG_SIZE = 260;
const SVG_CENTER = SVG_SIZE / 2;

const STORAGE_KEY = "pomodoro-state";

interface TimerSnapshot {
  mode: TimerMode;
  round: number;
  completed: number;
  focusMinutes: number;
  breakMinutes: number;
  isRunning: boolean;
  remaining: number;
  expiresAt: number | null;
  sessionId: string;
}

function createSessionId() {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `focus-${id}`;
}

function load(): TimerSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;

    const snapshot = value as Record<string, unknown>;
    const expiresAt = snapshot.expiresAt;
    if (
      (snapshot.mode !== "focus" && snapshot.mode !== "break") ||
      !Number.isInteger(snapshot.round) || Number(snapshot.round) < 1 ||
      !Number.isInteger(snapshot.completed) || Number(snapshot.completed) < 0 ||
      !Number.isFinite(snapshot.focusMinutes) || Number(snapshot.focusMinutes) <= 0 ||
      !Number.isFinite(snapshot.breakMinutes) || Number(snapshot.breakMinutes) <= 0 ||
      typeof snapshot.isRunning !== "boolean" ||
      !Number.isInteger(snapshot.remaining) || Number(snapshot.remaining) < 0 ||
      (expiresAt !== undefined && expiresAt !== null && !Number.isFinite(expiresAt))
    ) return null;

    return {
      mode: snapshot.mode,
      round: Number(snapshot.round),
      completed: Number(snapshot.completed),
      focusMinutes: Number(snapshot.focusMinutes),
      breakMinutes: Number(snapshot.breakMinutes),
      isRunning: snapshot.isRunning,
      remaining: Number(snapshot.remaining),
      expiresAt: typeof expiresAt === "number" ? expiresAt : null,
      sessionId: typeof snapshot.sessionId === "string" && snapshot.sessionId.startsWith("focus-")
        ? snapshot.sessionId
        : createSessionId(),
    };
  } catch {
    return null;
  }
}

function save(s: TimerSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function secondsUntil(expiresAt: number) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function playBeep(f: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = f; gain.gain.value = 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
    osc.stop(ctx.currentTime + 1.8);
  } catch {}
}

async function recordCompletedFocusSession(minutes: number, sessionId: string, source: "timer" | "restore") {
  console.info("[focus-session] full focus duration reached; sending to backend", {
    durationMinutes: minutes,
    source,
    sessionId,
  });
  try {
    const response = await fetch("/api/focus/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: minutes, sessionId }),
    });
    const result = await response.json().catch(() => null) as { ok?: boolean; recordId?: string; error?: string } | null;
    if (!response.ok || result?.ok !== true) {
      console.error("[focus-session] backend rejected completed session", { status: response.status, error: result?.error });
      return;
    }
    console.info("[focus-session] backend saved completed session", {
      durationMinutes: minutes,
      recordId: result?.recordId,
      sessionId,
    });
  } catch (error) {
    console.error("[focus-session] failed to send completed session", error);
  }
}

export const FocusTimer = forwardRef<PomodoroHandle, FocusTimerProps>(function FocusTimer(
  { focusMinutes = 25, breakMinutes = 5, onRestoreFocusMinutes, immersive = false, onStart },
  ref,
) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [round, setRound] = useState(1);
  const [completed, setCompleted] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [hydrated, setHydrated] = useState(false);

  const modeRef = useRef(mode); modeRef.current = mode;
  const isRunningRef = useRef(isRunning); isRunningRef.current = isRunning;
  const remainingRef = useRef(remaining); remainingRef.current = remaining;
  const focusMinRef = useRef(focusMinutes); focusMinRef.current = focusMinutes;
  const breakMinRef = useRef(breakMinutes); breakMinRef.current = breakMinutes;
  const roundRef = useRef(round); roundRef.current = round;
  const completedRef = useRef(completed); completedRef.current = completed;
  const expiresAtRef = useRef<number | null>(null);
  const sessionIdRef = useRef(createSessionId());
  const appliedFocusMinutesRef = useRef(focusMinutes);
  const appliedBreakMinutesRef = useRef(breakMinutes);
  const onRestoreFocusMinutesRef = useRef(onRestoreFocusMinutes);
  onRestoreFocusMinutesRef.current = onRestoreFocusMinutes;

  const totalSeconds = mode === "focus" ? focusMinutes * 60 : breakMinutes * 60;

  // ── 持久化 ──
  function persist(running: boolean, rem: number, expiresAt: number | null) {
    save({
      mode: modeRef.current, round: roundRef.current, completed: completedRef.current,
      focusMinutes: focusMinRef.current, breakMinutes: breakMinRef.current,
      isRunning: running, remaining: rem, expiresAt,
      sessionId: sessionIdRef.current,
    });
  }

  // 浏览器存储只能在挂载后读取，保证服务端和客户端的首次渲染一致。
  useEffect(() => {
    const snapshot = load();
    if (!snapshot) {
      setHydrated(true);
      return;
    }

    appliedFocusMinutesRef.current = snapshot.focusMinutes;
    appliedBreakMinutesRef.current = snapshot.breakMinutes;
    onRestoreFocusMinutesRef.current?.(snapshot.focusMinutes);
    modeRef.current = snapshot.mode;
    roundRef.current = snapshot.round;
    completedRef.current = snapshot.completed;
    sessionIdRef.current = snapshot.sessionId;
    setMode(snapshot.mode);
    setRound(snapshot.round);
    setCompleted(snapshot.completed);

    if (snapshot.isRunning) {
      const deadline = snapshot.expiresAt ?? Date.now() + snapshot.remaining * 1000;
      const restoredRemaining = secondsUntil(deadline);

      if (restoredRemaining > 0) {
        expiresAtRef.current = deadline;
        remainingRef.current = restoredRemaining;
        isRunningRef.current = true;
        setRemaining(restoredRemaining);
        setIsRunning(true);
        save({ ...snapshot, remaining: restoredRemaining, expiresAt: deadline });
      } else {
        const nextMode: TimerMode = snapshot.mode === "focus" ? "break" : "focus";
        const nextRound = snapshot.mode === "break" ? snapshot.round + 1 : snapshot.round;
        const nextCompleted = snapshot.mode === "focus" ? snapshot.completed + 1 : snapshot.completed;
        const nextRemaining = (nextMode === "focus" ? snapshot.focusMinutes : snapshot.breakMinutes) * 60;
        const nextSessionId = snapshot.mode === "break" ? createSessionId() : snapshot.sessionId;
        modeRef.current = nextMode;
        roundRef.current = nextRound;
        completedRef.current = nextCompleted;
        remainingRef.current = nextRemaining;
        sessionIdRef.current = nextSessionId;
        setMode(nextMode);
        setRound(nextRound);
        setCompleted(nextCompleted);
        setRemaining(nextRemaining);
        if (snapshot.mode === "focus") {
          void recordCompletedFocusSession(snapshot.focusMinutes, snapshot.sessionId, "restore");
        }
        save({ ...snapshot, mode: nextMode, round: nextRound, completed: nextCompleted, isRunning: false, remaining: nextRemaining, expiresAt: null, sessionId: nextSessionId });
      }
    } else {
      remainingRef.current = snapshot.remaining;
      setRemaining(snapshot.remaining);
    }

    setHydrated(true);
  }, []);

  function handleExpire(withSound = true) {
    const currentMode = modeRef.current;
    const nextMode: TimerMode = currentMode === "focus" ? "break" : "focus";
    const nextRound = currentMode === "break" ? roundRef.current + 1 : roundRef.current;
    const nextCompleted = currentMode === "focus" ? completedRef.current + 1 : completedRef.current;
    const nextRemaining = (nextMode === "focus" ? focusMinRef.current : breakMinRef.current) * 60;
    const completedSessionId = sessionIdRef.current;

    if (withSound) playBeep(800);
    if (currentMode === "focus") {
      void recordCompletedFocusSession(focusMinRef.current, completedSessionId, "timer");
    } else {
      sessionIdRef.current = createSessionId();
    }
    expiresAtRef.current = null;
    isRunningRef.current = false;
    modeRef.current = nextMode;
    roundRef.current = nextRound;
    completedRef.current = nextCompleted;
    remainingRef.current = nextRemaining;
    setIsRunning(false);
    setMode(nextMode);
    setRound(nextRound);
    setCompleted(nextCompleted);
    setRemaining(nextRemaining);
    save({ mode: nextMode, round: nextRound, completed: nextCompleted, focusMinutes: focusMinRef.current, breakMinutes: breakMinRef.current, isRunning: false, remaining: nextRemaining, expiresAt: null, sessionId: sessionIdRef.current });
  }

  // 使用绝对截止时间计算，刷新和浏览器后台节流都不会造成计时漂移。
  useEffect(() => {
    if (!hydrated || !isRunning) return;
    const deadline = expiresAtRef.current ?? Date.now() + remainingRef.current * 1000;
    expiresAtRef.current = deadline;
    persist(true, remainingRef.current, deadline);

    const update = () => {
      const next = secondsUntil(deadline);
      if (next <= 0) {
        handleExpire();
        return;
      }
      if (next !== remainingRef.current) {
        remainingRef.current = next;
        setRemaining(next);
        persist(true, next, deadline);
      }
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [hydrated, isRunning]);

  // 用户切换预设时长时才重置；恢复存储引起的首次属性同步会被忽略。
  useEffect(() => {
    if (!hydrated) return;
    if (focusMinutes === appliedFocusMinutesRef.current && breakMinutes === appliedBreakMinutesRef.current) return;

    appliedFocusMinutesRef.current = focusMinutes;
    appliedBreakMinutesRef.current = breakMinutes;
    const seconds = (modeRef.current === "focus" ? focusMinutes : breakMinutes) * 60;
    expiresAtRef.current = null;
    isRunningRef.current = false;
    remainingRef.current = seconds;
    sessionIdRef.current = createSessionId();
    setIsRunning(false);
    setRemaining(seconds);
    persist(false, seconds, null);
  }, [hydrated, focusMinutes, breakMinutes]);

  // 进入沉浸模式时若计时器未运行则自动开始（沉浸模式下无操作按钮）
  useEffect(() => {
    if (immersive && hydrated && !isRunningRef.current) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, hydrated]);

  function start() {
    const seconds = remainingRef.current > 0
      ? remainingRef.current
      : (modeRef.current === "focus" ? focusMinRef.current : breakMinRef.current) * 60;
    const deadline = Date.now() + seconds * 1000;
    remainingRef.current = seconds;
    expiresAtRef.current = deadline;
    isRunningRef.current = true;
    setRemaining(seconds);
    setIsRunning(true);
    persist(true, seconds, deadline);
    console.info("[focus-session] started", {
      mode: modeRef.current,
      selectedMinutes: modeRef.current === "focus" ? focusMinRef.current : breakMinRef.current,
      remainingSeconds: seconds,
    });
  }

  function pause() {
    const seconds = expiresAtRef.current === null
      ? remainingRef.current
      : secondsUntil(expiresAtRef.current);
    remainingRef.current = seconds;
    expiresAtRef.current = null;
    isRunningRef.current = false;
    setRemaining(seconds);
    setIsRunning(false);
    persist(false, seconds, null);
    console.info("[focus-session] paused; nothing sent to backend", {
      mode: modeRef.current,
      remainingSeconds: seconds,
      completedMinutes: modeRef.current === "focus" ? focusMinRef.current - Math.ceil(seconds / 60) : 0,
    });
  }

  function reset() {
    const seconds = focusMinRef.current * 60;
    sessionIdRef.current = createSessionId();
    expiresAtRef.current = null;
    isRunningRef.current = false;
    modeRef.current = "focus";
    roundRef.current = 1;
    completedRef.current = 0;
    remainingRef.current = seconds;
    setIsRunning(false);
    setMode("focus");
    setRound(1);
    setCompleted(0);
    setRemaining(seconds);
    save({ mode: "focus", round: 1, completed: 0, focusMinutes: focusMinRef.current, breakMinutes: breakMinRef.current, isRunning: false, remaining: seconds, expiresAt: null, sessionId: sessionIdRef.current });
    console.info("[focus-session] reset; nothing sent to backend");
  }

  function skip() {
    const currentMode = modeRef.current;
    const nextMode: TimerMode = currentMode === "focus" ? "break" : "focus";
    const nextRound = currentMode === "break" ? roundRef.current + 1 : roundRef.current;
    const seconds = (nextMode === "focus" ? focusMinRef.current : breakMinRef.current) * 60;
    if (nextMode === "focus") sessionIdRef.current = createSessionId();
    expiresAtRef.current = null;
    isRunningRef.current = false;
    modeRef.current = nextMode;
    roundRef.current = nextRound;
    remainingRef.current = seconds;
    setIsRunning(false);
    setMode(nextMode);
    setRound(nextRound);
    setRemaining(seconds);
    save({ mode: nextMode, round: nextRound, completed: completedRef.current, focusMinutes: focusMinRef.current, breakMinutes: breakMinRef.current, isRunning: false, remaining: seconds, expiresAt: null, sessionId: sessionIdRef.current });
    console.info("[focus-session] skipped; nothing sent to backend", { from: currentMode });
  }

  useImperativeHandle(ref, () => ({
    start,
    pause,
    reset,
    skip,
    getIsRunning: () => isRunningRef.current,
    getMode: () => modeRef.current,
  }));

  const progress = totalSeconds > 0 ? 1 - remaining / totalSeconds : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const displayMin = Math.floor(remaining / 60);
  const displaySec = remaining % 60;
  const timeDisplay = `${String(displayMin).padStart(2, "0")}:${String(displaySec).padStart(2, "0")}`;

  if (immersive) {
    return <span className="immersive-timer tabular-nums">{timeDisplay}</span>;
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={SVG_SIZE} height={SVG_SIZE} className="-rotate-90" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
          <circle cx={SVG_CENTER} cy={SVG_CENTER} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
          <motion.circle cx={SVG_CENTER} cy={SVG_CENTER} r={RING_RADIUS}
            fill="none" stroke="var(--theme-primary)" strokeWidth={5} strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.5, ease: "linear" }}
            style={{ filter: "drop-shadow(0 0 12px color-mix(in srgb, var(--theme-primary) 50%, transparent))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="mb-1.5 text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
            Round {round} · {mode === "focus" ? "专注" : "休息"}
          </span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[3.5rem] font-extralight tabular-nums tracking-tighter text-foreground">
              {timeDisplay}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-5">
        <Tooltip>
          <TooltipTrigger render={
            <button onClick={reset}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground"
              aria-label="重置" />
          }>
            <ArrowCounterClockwise className="h-5 w-5" />
          </TooltipTrigger>
          <TooltipContent>重置</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={
            <button onClick={() => {
              if (isRunning) {
                pause();
              } else if (!immersive && onStart) {
                onStart();
              } else {
                start();
              }
            }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:scale-105 active:scale-95"
              aria-label={isRunning ? "暂停" : "开始"} />
          }>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={isRunning ? "pause" : "play"} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: 0.15 }}>
                {isRunning ? <Pause className="h-7 w-7" weight="fill" /> : <Play className="ml-1 h-7 w-7" weight="fill" />}
              </motion.div>
            </AnimatePresence>
          </TooltipTrigger>
          <TooltipContent>{isRunning ? "暂停" : "开始"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={
            <button onClick={skip}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground"
              aria-label="跳过" />
          }>
            <SkipForward className="h-5 w-5" />
          </TooltipTrigger>
          <TooltipContent>跳过</TooltipContent>
        </Tooltip>
      </div>
      {completed > 0 && (
        <div className="mt-5 flex items-center gap-1.5">
          {Array.from({ length: Math.min(completed, 8) }).map((_, i) => <span key={i} className="h-2.5 w-2.5 rounded-sm bg-primary/70" />)}
          {completed > 8 && <span className="ml-1 text-xs text-muted-foreground">×{completed}</span>}
        </div>
      )}
    </div>
  );
});
