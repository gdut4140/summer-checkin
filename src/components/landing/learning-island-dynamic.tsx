"use client";

import dynamic from "next/dynamic";

/**
 * three.js 小岛按需加载（ssr:false）。
 * 把 three / @react-three/fiber / drei（约 1MB 的 bundle）拆成独立 chunk：
 * 页面首屏先渲染热力图 / 统计等轻 UI，小岛异步就位后再挂 WebGL canvas ——
 * 对用户无感，因为 canvas 本来就要等客户端才渲染。
 */
const LearningIsland = dynamic(
  () => import("./learning-island").then((m) => m.LearningIsland),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0" aria-hidden="true" />,
  }
);

export default LearningIsland;
