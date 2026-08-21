"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  SCENE_COPY,
  DEFAULT_SCENE,
  SCENE_STORAGE_KEY,
  asSceneType,
  getSceneCopy,
  type SceneCopy,
  type SceneType,
} from "@/lib/scene-meta";

// 把纯数据 / 纯函数 / 类型一起 re-export，让既有客户端文件里
// `import { useSceneCopy, type SceneType, getSceneCopy } from "@/context/scene-context"`
// 的导入路径不用改，保持单点共享。
export type { SceneType, SceneCopy };
export { SCENE_COPY, DEFAULT_SCENE, SCENE_STORAGE_KEY, asSceneType, getSceneCopy };

interface SceneContextValue {
  scene: SceneType;
  setScene: (scene: SceneType) => void;
  /** 当前场景的所有 UI 文案（标题 / slogan / 按钮 / toast 等，直接按语义字段读） */
  copy: SceneCopy;
}

const SceneContext = createContext<SceneContextValue | undefined>(undefined);

const STORAGE_KEY = SCENE_STORAGE_KEY;

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
    const initial = asSceneType(saved);
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

  // 文案绑定：scene 变了 copy 自动切到对应配置
  const copy = useMemo<SceneCopy>(() => SCENE_COPY[scene], [scene]);

  return (
    <SceneContext.Provider value={{ scene, setScene, copy }}>
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

/**
 * 直接拿当前场景的文案配置。
 * 用法：
 *   const { roomTitle, roomSlogan } = useSceneCopy();
 *   <h1>{roomTitle}</h1>
 */
export function useSceneCopy(): SceneCopy {
  return useScene().copy;
}
