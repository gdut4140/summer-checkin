"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { MathUtils, type Group } from "three";

// ── 小单元、绵密感 ──
const UNIT = 0.34;
const GRID_X = { min: -12, max: 12 };
const GRID_Z = { min: -8, max: 8 };
const INITIAL_TILES = 150;
const TILES_PER_CHECKIN = 5;

type TileKind = "forest" | "moss" | "water" | "rock" | "river" | "village" | "waterfall";

type Tile = {
  x: number;
  z: number;
  height: number;
  elevation: number; // 海拔 — 高则浮空，低则下陷
  delay: number;
  kind: TileKind;
  unlockOrder: number;
};

type SceneType = "rain" | "snow" | "cloud";

// ── 场景调色板接口（新增 sceneLight 双场色 + villageTop 收归） ──
interface ScenePalette {
  treeTrunk: string;
  treeCrown1: string;
  treeCrown2: string;
  treeCrown3: string;
  treeCrown4: string;
  mountain1: string;
  mountain2: string;
  mountainSnow: string;
  fern1: string;
  fern2: string;
  rock1: string;
  rock2: string;
  pond: string;
  pondFlower: string;
  waterTop: string;
  rockTop: string;
  mossTop: string;
  forestTop: string;
  tileSide: string;
  riverTop: string;
  riverEmissive: string;
  villageWall: string;
  villageRoof: string;
  villageTop: string;
  sceneSky: string;
  sceneGround: string;
  sceneIntensity: number;
}

// ── 雨林调色板（原 PALETTE + 补 villageTop 与场景光） ──
const PALETTE_RAIN: ScenePalette = {
  treeTrunk: "#6b5a3e",
  treeCrown1: "#4d9e6a",
  treeCrown2: "#5ead78",
  treeCrown3: "#6dbf8a",
  treeCrown4: "#82cf9d",
  mountain1: "#4d8a6a",
  mountain2: "#5e9a78",
  mountainSnow: "#98c9a8",
  fern1: "#55a870",
  fern2: "#6dbd85",
  rock1: "#5e8a6e",
  rock2: "#789d80",
  pond: "#6ec98a",
  pondFlower: "#e8bbc8",
  waterTop: "#5ab8b0",
  rockTop: "#649075",
  mossTop: "#6dbd85",
  forestTop: "#5eaa78",
  tileSide: "#244839",
  riverTop: "#3b9ec8",
  riverEmissive: "#0a2a3a",
  villageWall: "#d4c8a8",
  villageRoof: "#c47a4a",
  villageTop: "#8a9e7a",
  sceneSky: "#d4f0e0",
  sceneGround: "#0d241a",
  sceneIntensity: 1.3,
};

// ── 雪景调色板（雪山 + 盖雪欧洲小镇，灰蓝 + 暖木屋） ──
const PALETTE_SNOW: ScenePalette = {
  treeTrunk: "#7a6e62",
  treeCrown1: "#f4f8fb",
  treeCrown2: "#e4eaf0",
  treeCrown3: "#d0dae6",
  treeCrown4: "#c0cee0",
  mountain1: "#6a7a8c",
  mountain2: "#5a6a7c",
  mountainSnow: "#f8faff",
  fern1: "#d0dae6",
  fern2: "#e4eaf0",
  rock1: "#5a6a7c",
  rock2: "#7a8a9c",
  pond: "#c0cee0",
  pondFlower: "#e4eaf0",
  waterTop: "#9ab0c8",
  rockTop: "#d0dae6",
  mossTop: "#e4eaf0",
  forestTop: "#d8e2ee",
  tileSide: "#2e3e4e",
  riverTop: "#d0dae6",
  riverEmissive: "#1a2a38",
  villageWall: "#e8ddd0",
  villageRoof: "#a89888",
  villageTop: "#f0f4f8",
  sceneSky: "#f0f5f9",
  sceneGround: "#1e2e3e",
  sceneIntensity: 1.22,
};

// ── 暖云调色板（欧洲小镇 + 云层山脉，米白 + 暖陶瓦） ──
const PALETTE_CLOUD: ScenePalette = {
  treeTrunk: "#8a7a62",
  treeCrown1: "#faf4e4",
  treeCrown2: "#f2e8cc",
  treeCrown3: "#e8dcba",
  treeCrown4: "#dcd0a6",
  mountain1: "#8a9aaa",
  mountain2: "#a0aeb8",
  mountainSnow: "#fefcf4",
  fern1: "#d8dfc4",
  fern2: "#e8ecd4",
  rock1: "#aaa08a",
  rock2: "#c4bca6",
  pond: "#c8d6de",
  pondFlower: "#f0dcd4",
  waterTop: "#9ab4c4",
  rockTop: "#e4dcc8",
  mossTop: "#f0e8d2",
  forestTop: "#d4dcb8",
  tileSide: "#3e3a2e",
  riverTop: "#a8c0d0",
  riverEmissive: "#2a2e34",
  villageWall: "#f4ead4",
  villageRoof: "#b0784a",
  villageTop: "#f0e4cc",
  sceneSky: "#faf4e4",
  sceneGround: "#3a362e",
  sceneIntensity: 1.28,
};

// ── Context：子组件（Tree / Fern / Rock / TileMesh 等）统一读 palette ──
const PaletteContext = createContext<ScenePalette>(PALETTE_RAIN);
function usePalette(): ScenePalette {
  return useContext(PaletteContext);
}

// ── DOM data-scene → palette ──
function paletteForScene(scene: string | null | undefined): ScenePalette {
  if (scene === "snow") return PALETTE_SNOW;
  if (scene === "cloud") return PALETTE_CLOUD;
  return PALETTE_RAIN;
}
function readSceneFromDOM(): SceneType {
  if (typeof document === "undefined") return "rain";
  const v = document.documentElement.dataset.scene as SceneType | undefined;
  return v === "snow" || v === "cloud" ? v : "rain";
}

// ── 生成所有 tile ──
const allTilesRaw: Array<{ x: number; z: number }> = [];
for (let z = GRID_Z.min; z <= GRID_Z.max; z++) {
  for (let x = GRID_X.min; x <= GRID_X.max; x++) {
    const ex = x / (GRID_X.max + 1);
    const ez = z / (GRID_Z.max + 1);
    if (ex * ex + ez * ez > 1.05) continue;
    allTilesRaw.push({ x, z });
  }
}

// ── 种子随机数（Mulberry32） ──
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── 随机解锁顺序（种子固定，保证每次渲染一致） ──
function buildShuffledUnlockOrder(tiles: Array<{ x: number; z: number }>): Map<string, number> {
  const rng = mulberry32(20260804); // 固定种子
  const shuffled = [...tiles];
  // Fisher-Yates
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const map = new Map<string, number>();
  shuffled.forEach((t, i) => map.set(`${t.x},${t.z}`, i + 1));
  return map;
}

const unlockOrderMap = buildShuffledUnlockOrder(allTilesRaw);

// ── 噪声函数 ──
function noise2D(x: number, z: number, seed: number): number {
  return Math.sin(x * 0.37 + seed) * Math.cos(z * 0.41 + seed * 1.3);
}

// ── 河流路径：蛇形穿越岛屿 ──
function isOnRiver(x: number, z: number): boolean {
  const riverCenter = Math.sin(x * 0.22) * 3.5 + Math.sin(x * 0.13 + 1.5) * 2 + Math.cos(x * 0.08) * 1.5;
  return Math.abs(z - riverCenter) < 0.85;
}
const riverCells = new Set<string>();
for (const { x, z } of allTilesRaw) {
  if (isOnRiver(x, z)) riverCells.add(`${x},${z}`);
}

// ── 村庄：河流旁的低地小聚落 ──
const villageCoords = [
  [-3, -1], [-2, -2], [-1, -1],  // 左岸村落
  [4, 1], [5, 0], [4, 2],         // 右岸村落
];
const villageCells = new Set(villageCoords.map(([x, z]) => `${x},${z}`));

// ── 瀑布：河流上 3 处落差点 ──
const waterfallCoords = [
  [-5, -1], [1, 2], [7, -2],
];
const waterfallCells = new Set(waterfallCoords.map(([x, z]) => `${x},${z}`));

// ── 村庄周围的平原（砍掉高树） ──
const villageClearing = new Set<string>();
for (const [vx, vz] of villageCoords) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      villageClearing.add(`${vx + dx},${vz + dz}`);
    }
  }
}

function cellKind(key: string, x: number, z: number): TileKind {
  if (waterfallCells.has(key)) return "waterfall";
  if (riverCells.has(key)) return "river";
  if (villageCells.has(key)) return "village";
  // 村庄周围清成苔藓平原，不种高树
  if (villageClearing.has(key)) return "moss";
  const h = ((x * 17 + z * 31 + 100) % 101);
  if (h < 6) return "water";
  if (h < 18) return "rock";
  if (h < 38) return "moss";
  return "forest";
}

const tiles: Tile[] = allTilesRaw.map(({ x, z }) => {
  const key = `${x},${z}`;
  const kind = cellKind(key, x, z);

  // 到中心的归一化距离（0=中心, 1=边缘）
  const ex = x / (GRID_X.max + 1);
  const ez = z / (GRID_Z.max + 1);
  const distFromCenter = Math.hypot(ex, ez);

  // 中心隆起 — 中间高、两边低
  const centerPeak = Math.max(0, 1 - distFromCenter) * 1.6;
  const centerRamp = Math.max(0, 1 - distFromCenter * 0.7) * 0.8;

  // 多层噪声叠加
  const n1 = noise2D(x, z, 0) * 0.4;
  const n2 = noise2D(x, z, 5) * 0.35;
  const n3 = Math.sin(x * 0.25 + z * 0.3) * Math.cos(z * 0.2 - x * 0.15) * 0.5;
  const n4 = Math.abs(noise2D(x, z, 10)) * 0.4;

  // 浮空
  const floatChance = Math.abs(Math.sin(x * 0.7 + z * 0.9 + 2)) * Math.abs(Math.cos(z * 0.6 + x * 0.8));
  const isFloating = floatChance > 0.72 && distFromCenter < 0.6; // 只在中心区域浮空
  const floatBoost = isFloating ? 0.4 + Math.abs(noise2D(x, z, 15)) * 0.6 : 0;

  // 合成海拔：中心峰值 + 噪声 + 浮空加成 - 边缘衰减
  let rawElevation = centerPeak + centerRamp * 0.5 + n1 + n2 + n3 * 0.4 + n4 * 0.3 + floatBoost - distFromCenter * 0.3;

  // 村庄区域压平，让木屋露出来
  if (villageClearing.has(key)) {
    rawElevation = 0.15;
  } else if (villageCoords.some(([vx, vz]) => Math.abs(x - vx) <= 2 && Math.abs(z - vz) <= 2)) {
    // 村庄外一圈柔和过渡
    rawElevation = rawElevation * 0.35 + 0.1;
  }

  const elevation = kind === "water" ? rawElevation - 0.6
    : kind === "river" || kind === "waterfall" ? rawElevation - 0.35
    : Math.round(rawElevation * 100) / 100;

  // 柱体高度：中心区域更高
  const baseHeight = 0.2 + Math.abs((x * 13 + z * 19 + 60) % 7) * 0.07 + (1 - distFromCenter) * 0.3;
  const height = isFloating ? baseHeight + 0.15 : baseHeight;

  const delay = 0.02 + distFromCenter * 0.05;

  return {
    x,
    z,
    height,
    elevation,
    delay,
    kind,
    unlockOrder: unlockOrderMap.get(key) ?? 999,
  };
});

const totalTiles = tiles.length;

// ============================================================
// ── 装饰组件（按新比例缩小） ──
// ============================================================

function NewTileSparkle({ color }: { color: string }) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      if (i === 0) return;
      const offset = Math.sin(t * 2.0 + i * 0.9) * (0.05 + (i % 3) * 0.03);
      child.position.y = 0.16 + offset;
    });
    const breathe = 1 + Math.sin(t * 1.2) * 0.1;
    group.current.scale.setScalar(breathe);
    const ring = group.current.children[0];
    if (ring) ring.rotation.z += 0.004;
  });
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.14, 0.22, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={2} />
      </mesh>
      <mesh position={[0, 0.11, 0]}>
        <sphereGeometry args={[0.04, 6, 4]} />
        <meshBasicMaterial color="#fffef0" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.08, 6, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const radius = 0.2;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, 0.16, Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.035, 5, 3]} />
            <meshBasicMaterial color="#fffbe6" transparent opacity={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

function TinyTree({ variant }: { variant: number }) {
  const palette = usePalette();
  const crown = useRef<Group>(null);
  useFrame((state) => {
    if (!crown.current) return;
    crown.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.85 + variant * 0.7) * 0.03;
    crown.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.7 + variant) * 0.015;
  });
  const tall = variant % 3 === 0;
  const s = tall ? 1.05 : 0.82;
  return (
    <group scale={s}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.4, 5]} />
        <meshStandardMaterial color={palette.treeTrunk} roughness={1} />
      </mesh>
      <group ref={crown} position={[0, 0.4, 0]}>
        <mesh castShadow position={[0, 0.04, 0]}>
          <icosahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color={palette.treeCrown1} flatShading roughness={0.94} />
        </mesh>
        <mesh castShadow position={[-0.12, -0.01, 0.02]}>
          <icosahedronGeometry args={[0.14, 0]} />
          <meshStandardMaterial color={palette.treeCrown2} flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.12, 0, -0.02]}>
          <icosahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color={palette.treeCrown3} flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.03, 0.18, 0.01]}>
          <icosahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial color={palette.treeCrown4} flatShading roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function TinyMountain({ variant }: { variant: number }) {
  const palette = usePalette();
  const h = 0.5 + (variant % 3) * 0.1;
  return (
    <group>
      <mesh castShadow position={[0, h / 2, 0]} rotation={[0, variant * 0.42, 0]}>
        <coneGeometry args={[0.22, h, 5]} />
        <meshStandardMaterial color={palette.mountain1} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.12, h * 0.34, 0.05]} rotation={[0, 0.5, 0]}>
        <coneGeometry args={[0.13, h * 0.6, 5]} />
        <meshStandardMaterial color={palette.mountain2} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[-0.05, h - 0.05, 0]} rotation={[0, variant * 0.42, 0]}>
        <coneGeometry args={[0.06, 0.12, 5]} />
        <meshStandardMaterial color={palette.mountainSnow} flatShading roughness={0.95} />
      </mesh>
    </group>
  );
}

function TinyFern({ variant }: { variant: number }) {
  const palette = usePalette();
  return (
    <group rotation={[0, variant * 0.65, 0]}>
      {[0, 1, 2, 3, 4].map((leaf) => (
        <mesh
          key={leaf}
          castShadow
          position={[Math.cos(leaf * 1.26) * 0.06, 0.06, Math.sin(leaf * 1.26) * 0.06]}
          rotation={[0.35, -leaf * 1.26, 0.65]}
        >
          <coneGeometry args={[0.032, 0.17, 4]} />
          <meshStandardMaterial color={leaf % 2 ? palette.fern1 : palette.fern2} flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function TinyRock({ variant }: { variant: number }) {
  const palette = usePalette();
  return (
    <group rotation={[0, variant * 0.8, 0]}>
      <mesh castShadow position={[0, 0.08, 0]} scale={[1, 0.72, 0.82]}>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color={palette.rock1} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.08, 0.04, 0.05]} scale={0.55}>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={palette.rock2} flatShading roughness={1} />
      </mesh>
    </group>
  );
}

function TinyHouse({ variant }: { variant: number }) {
  const palette = usePalette();
  const woodColor = palette.treeTrunk;
  const roofColor = palette.villageRoof;
  const wallColor = palette.villageWall;
  return (
    <group>
      {/* 屋体 — 使用场景色 */}
      <mesh castShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[0.18, 0.2, 0.15]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} />
      </mesh>
      {/* 横向木纹条 */}
      {[0.04, 0.1, 0.16].map((y) => (
        <mesh key={y} position={[0, y, 0.08]}>
          <boxGeometry args={[0.19, 0.02, 0.01]} />
          <meshStandardMaterial color={woodColor} roughness={0.9} />
        </mesh>
      ))}
      {/* 三角屋顶 — 深陶瓦色 */}
      <mesh castShadow position={[0, 0.23, 0]}>
        <coneGeometry args={[0.15, 0.12, 4]} />
        <meshStandardMaterial color={roofColor} flatShading roughness={0.95} />
      </mesh>
      {/* 小窗户 — 暖黄光 */}
      <mesh position={[0.06, 0.12, 0.08]}>
        <boxGeometry args={[0.03, 0.04, 0.01]} />
        <meshBasicMaterial color="#fdf6e3" />
      </mesh>
      {/* 门 */}
      <mesh position={[-0.04, 0.06, 0.08]}>
        <boxGeometry args={[0.035, 0.08, 0.01]} />
        <meshStandardMaterial color={woodColor} roughness={0.8} />
      </mesh>
      {/* 烟囱 */}
      <mesh position={[0.05, 0.28, -0.02]}>
        <boxGeometry args={[0.03, 0.08, 0.03]} />
        <meshStandardMaterial color={woodColor} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Waterfall() {
  const palette = usePalette();
  return (
    <group>
      {/* 水流柱 */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.35, 8]} />
        <meshStandardMaterial color={palette.riverTop} roughness={0.1} emissive={palette.riverEmissive} emissiveIntensity={0.5} transparent opacity={0.75} />
      </mesh>
      {/* 水花 */}
      <mesh position={[0.03, -0.26, 0.02]}>
        <sphereGeometry args={[0.07, 6, 4]} />
        <meshBasicMaterial color={palette.waterTop} transparent opacity={0.25} />
      </mesh>
      <mesh position={[-0.04, -0.28, -0.01]}>
        <sphereGeometry args={[0.05, 5, 3]} />
        <meshBasicMaterial color={palette.waterTop} transparent opacity={0.2} />
      </mesh>
      {/* 顶部小水池 */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 8]} />
        <meshStandardMaterial color={palette.riverTop} roughness={0.15} emissive={palette.riverEmissive} emissiveIntensity={0.3} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function RiverSurface() {
  const palette = usePalette();
  return (
    <group>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 8]} />
        <meshStandardMaterial color={palette.riverTop} roughness={0.15} emissive={palette.riverEmissive} emissiveIntensity={0.4} transparent opacity={0.9} />
      </mesh>
      {/* 波纹 */}
      <mesh position={[0.04, 0.02, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.07, 16]} />
        <meshBasicMaterial color={palette.waterTop} transparent opacity={0.35} side={2} />
      </mesh>
    </group>
  );
}

function TinyPond({ variant }: { variant: number }) {
  const palette = usePalette();
  return (
    <group>
      <mesh position={[-0.07, 0.02, 0.03]} rotation={[-Math.PI / 2, 0, variant * 0.7]}>
        <circleGeometry args={[0.055, 6]} />
        <meshStandardMaterial color={palette.pond} roughness={0.75} />
      </mesh>
      {variant % 2 === 0 && (
        <mesh position={[0.08, 0.03, -0.05]}>
          <sphereGeometry args={[0.022, 6, 4]} />
          <meshStandardMaterial color={palette.pondFlower} emissive="#7a4058" emissiveIntensity={0.2} />
        </mesh>
      )}
    </group>
  );
}

function TileDecoration({ tile, index }: { tile: Tile; index: number }) {
  const { kind } = tile;
  if (kind === "rock") return <TinyRock variant={index} />;
  if (kind === "water") return <TinyPond variant={index} />;
  if (kind === "river") return <RiverSurface />;
  if (kind === "waterfall") return <Waterfall />;
  if (kind === "village") return <TinyHouse variant={index} />;
  if (kind === "moss") {
    if ((tile.x * 7 + tile.z * 11 + 30) % 3 !== 0) return <TinyFern variant={index} />;
    return null;
  }
  // forest
  return <TinyTree variant={index} />;
}

// ============================================================
// ── 单个地块 ──
// ============================================================

function GrowingTile({
  tile,
  index,
  reducedMotion,
  isUnlocked,
  isTodayNew,
  isFloating,
}: {
  tile: Tile;
  index: number;
  reducedMotion: boolean;
  isUnlocked: boolean;
  isTodayNew: boolean;
  isFloating: boolean;
}) {
  const palette = usePalette();
  const group = useRef<Group>(null);
  const hovered = useRef(false);
  const hoverOffset = useRef(0);
  const baseY = -tile.height + tile.elevation;

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!isUnlocked) { group.current.visible = false; return; }
    group.current.visible = true;
    const raw = reducedMotion ? 1 : MathUtils.clamp((state.clock.elapsedTime - tile.delay) / 0.55, 0, 1);
    const progress = 1 - Math.pow(1 - raw, 3);
    hoverOffset.current = MathUtils.damp(hoverOffset.current, hovered.current ? 0.25 : 0, 10, delta);
    // 浮空单元微微上下浮动
    const floatBob = isFloating ? Math.sin(state.clock.elapsedTime * 1.2 + tile.x * 0.5 + tile.z * 0.7) * 0.08 : 0;
    group.current.position.y = baseY + hoverOffset.current + floatBob;
    group.current.scale.set(0.7 + progress * 0.3, Math.max(progress, 0.001), 0.7 + progress * 0.3);
  });

  const topColor =
    tile.kind === "water" ? palette.waterTop
    : tile.kind === "river" || tile.kind === "waterfall" ? palette.riverTop
    : tile.kind === "village" ? palette.villageTop
    : tile.kind === "rock" ? palette.rockTop
    : tile.kind === "moss" ? palette.mossTop
    : palette.forestTop;

  const tileW = UNIT * 0.92;

  return (
    <group
      ref={group}
      position={[tile.x * UNIT, baseY, tile.z * UNIT]}
      scale={[0.7, 0.001, 0.7]}
      onPointerOver={(e) => { e.stopPropagation(); hovered.current = true; document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { hovered.current = false; document.body.style.cursor = "default"; }}
    >
      {/* 柱体侧面 */}
      <mesh castShadow receiveShadow position={[0, tile.height / 2, 0]}>
        <boxGeometry args={[tileW, tile.height, tileW]} />
        <meshStandardMaterial color={palette.tileSide} roughness={0.96} />
      </mesh>
      {/* 顶面 */}
      <mesh castShadow receiveShadow position={[0, tile.height + 0.02, 0]}>
        <boxGeometry args={[tileW, 0.04, tileW]} />
        <meshStandardMaterial
          color={topColor}
          emissive={tile.kind === "water" ? "#124f4a" : (tile.kind === "river" || tile.kind === "waterfall") ? palette.riverEmissive : "#000000"}
          emissiveIntensity={tile.kind === "water" ? 0.4 : (tile.kind === "river" || tile.kind === "waterfall") ? 0.35 : 0}
          roughness={tile.kind === "water" ? 0.34 : 0.9}
        />
      </mesh>
      {/* 装饰 */}
      <group position={[0, tile.height + 0.04, 0]}>
        <TileDecoration tile={tile} index={index} />
      </group>
      {/* 今日标记 */}
      {isTodayNew && (
        <group position={[0, tile.height + 0.22, 0]}>
          <NewTileSparkle color="#fff9c4" />
        </group>
      )}
    </group>
  );
}

// ============================================================
// ── 主岛 ──
// ============================================================

function Island({ unlockedCount, todayCount }: { unlockedCount: number; todayCount: number }) {
  const island = useRef<Group>(null);
  const reducedMotion = useReducedMotion();

  useFrame((state) => {
    if (!island.current || reducedMotion) return;
    island.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.025;
  });

  const todayStartOrder = Math.max(1, unlockedCount - todayCount + 1);

  return (
    <group ref={island} rotation={[0, -0.18, 0]}>
      {tiles.map((tile, index) => {
        const isUnlocked = tile.unlockOrder <= unlockedCount;
        const isTodayNew = todayCount > 0 && tile.unlockOrder >= todayStartOrder && tile.unlockOrder <= unlockedCount;
        const isFloating = tile.elevation > 0.6;
        return (
          <GrowingTile
            key={`${tile.x}-${tile.z}`}
            tile={tile}
            index={index}
            reducedMotion={reducedMotion}
            isUnlocked={isUnlocked}
            isTodayNew={isTodayNew}
            isFloating={isFloating}
          />
        );
      })}
    </group>
  );
}

function useReducedMotion() {
  return useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
}

// ── 场景光：跟随 palette（雪/雨两套完全不同的环境色） ──
function SceneLights() {
  const palette = usePalette();
  return (
    <hemisphereLight args={[palette.sceneSky, palette.sceneGround, palette.sceneIntensity]} />
  );
}

// ============================================================
// ── 导出 ──
// ============================================================

type LearningIslandProps = {
  totalCheckins?: number;
  streak?: number;
  totalHours?: number;
  todayCheckins?: number;
};

export function LearningIsland({
  totalCheckins = 0,
  streak = 0,
  totalHours = 0,
  todayCheckins = 0,
}: LearningIslandProps) {
  const unlockedCount = Math.min(totalTiles, INITIAL_TILES + totalCheckins * TILES_PER_CHECKIN);

  // ── 场景 → PALETTE：自动跟随 html[data-scene] 切换 ──
  const [palette, setPalette] = useState<ScenePalette>(() => paletteForScene(readSceneFromDOM()));

  useEffect(() => {
    if (typeof document === "undefined") return;
    // 初始状态
    setPalette(paletteForScene(document.documentElement.dataset.scene));
    // 监听场景切换（用户在 selector 点雨林/雪景）
    const observer = new MutationObserver(() => {
      setPalette(paletteForScene(document.documentElement.dataset.scene));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-scene"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <PaletteContext.Provider value={palette}>
      <div
        className="relative h-full w-full touch-none"
        role="img"
        aria-label={`小岛，累计 ${totalCheckins} 次打卡，连续 ${streak} 天，学习 ${Math.round(totalHours * 10) / 10} 小时`}
      >
        <Canvas
          dpr={[1, 1.65]}
          shadows
          orthographic
          camera={{ position: [8, 8, 9], zoom: 62, near: 0.1, far: 120 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={1.4} />
          <SceneLights />
          <directionalLight
            castShadow
            position={[5, 10, 4]}
            intensity={2.0}
            color="#f0faf0"
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-8}
            shadow-camera-right={8}
            shadow-camera-top={8}
            shadow-camera-bottom={-8}
          />
          <Island unlockedCount={unlockedCount} todayCount={todayCheckins} />
          <ContactShadows
            position={[0, -1.2, 0]}
            opacity={0.35}
            scale={14}
            blur={2.8}
            far={6}
            color="#010906"
          />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 2.4}
            minAzimuthAngle={-Infinity}
            maxAzimuthAngle={Infinity}
            target={[0, 0.3, 0]}
          />
        </Canvas>
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 text-xs text-white/45">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          拖动查看
        </div>
      </div>
    </PaletteContext.Provider>
  );
}
