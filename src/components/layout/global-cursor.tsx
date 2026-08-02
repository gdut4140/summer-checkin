"use client";

import { usePathname } from "next/navigation";
import TargetCursor from "@/components/landing/TargetCursor";

export default function GlobalCursor() {
  const pathname = usePathname();

  // 首屏（首页）不显示自定义光标
  if (pathname === "/") {
    return null;
  }

  return (
    <TargetCursor
      targetSelector=".cursor-target"
      spinDuration={2}
      hideDefaultCursor={true}
      hoverDuration={0.2}
      parallaxOn={true}
      cursorColor="#f3c969"
    />
  );
}
