"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// 全局悬浮球：可拖动；点击（非拖拽）跳转到智能体独立页面 /agent
export function AgentOrb() {
  const router = useRouter();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, moved: false, dx: 0, dy: 0 });

  useEffect(() => {
    const saved = localStorage.getItem("rainforest-orb-position");
    let parsed: { x: number; y: number } | null = null;
    try {
      parsed = saved ? (JSON.parse(saved) as { x: number; y: number }) : null;
    } catch {
      localStorage.removeItem("rainforest-orb-position");
    }
    const frame = requestAnimationFrame(() => {
      setPosition({
        x: parsed?.x ?? window.innerWidth - 92,
        y: parsed?.y ?? Math.round(window.innerHeight * 0.62),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function keepOrbInViewport() {
      setPosition((current) => {
        const next = {
          x: current.x + 32 < window.innerWidth / 2 ? 12 : window.innerWidth - 76,
          y: clamp(current.y, 76, window.innerHeight - 76),
        };
        localStorage.setItem("rainforest-orb-position", JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", keepOrbInViewport);
    return () => window.removeEventListener("resize", keepOrbInViewport);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      dragging: true,
      moved: false,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.dragging) return;
    const nextX = clamp(event.clientX - dragRef.current.dx, 12, window.innerWidth - 76);
    const nextY = clamp(event.clientY - dragRef.current.dy, 76, window.innerHeight - 76);
    if (Math.abs(nextX - position.x) > 3 || Math.abs(nextY - position.y) > 3) dragRef.current.moved = true;
    setPosition({ x: nextX, y: nextY });
  }

  function onPointerUp() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (!dragRef.current.moved) {
      // 点击（未拖动）→ 跳转到智能体页面
      router.push("/agent");
      return;
    }
    const snapped = {
      x: position.x + 32 < window.innerWidth / 2 ? 12 : window.innerWidth - 76,
      y: clamp(position.y, 76, window.innerHeight - 76),
    };
    setPosition(snapped);
    localStorage.setItem("rainforest-orb-position", JSON.stringify(snapped));
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="打开探索雨林"
            className="rainforest-orb fixed z-40 touch-none select-none"
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        }
      >
        <span className="rainforest-orb__halo" />
        <span className="rainforest-orb__core"><Leaf weight="fill" /></span>
        <span className="rainforest-orb__spark rainforest-orb__spark--one" />
        <span className="rainforest-orb__spark rainforest-orb__spark--two" />
      </TooltipTrigger>
      <TooltipContent side="left">探索雨林</TooltipContent>
    </Tooltip>
  );
}
