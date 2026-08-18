"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SceneType = "rain" | "snow";

interface SceneContextValue {
  scene: SceneType;
  setScene: (scene: SceneType) => void;
}

const SceneContext = createContext<SceneContextValue | undefined>(undefined);

const STORAGE_KEY = "summer-checkin-scene";
const DEFAULT_SCENE: SceneType = "rain";

/** 把场景同步到 html[data-scene]，让 CSS 变量选择器生效 */
function applySceneToDOM(scene: SceneType) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.scene !== scene) {
    root.dataset.scene = scene;
  }
}

export function SceneProvider({ children }: { children: ReactNode }) {
  const [scene, setSceneState] = useState<SceneType>(DEFAULT_SCENE);

  // 1) 从 localStorage 读取用户偏好；2) SSR 后首帧立刻把 data-scene 写到 DOM
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial: SceneType = saved === "rain" || saved === "snow" || saved === "cloud" ? saved : DEFAULT_SCENE;
    setSceneState(initial);
    applySceneToDOM(initial);
  }, []);

  const setScene = (next: SceneType) => {
    setSceneState(next);
    applySceneToDOM(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <SceneContext.Provider value={{ scene, setScene }}>
      {children}
    </SceneContext.Provider>
  );
}

export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) {
    throw new Error("useScene must be used within a SceneProvider");
  }
  return ctx;
}
