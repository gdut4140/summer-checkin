"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { MathUtils, type Group } from "three";

const UNIT = 0.62;

type TileKind = "forest" | "moss" | "water" | "rock";

type Tile = {
  x: number;
  z: number;
  height: number;
  elevation: number;
  delay: number;
  kind: TileKind;
  unlockOrder: number; // 解锁顺序，从中心向外螺旋
};

// ── 自然绿色调色板（比柔和版饱和度稍高） ──
const PALETTE = {
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
  tileTopDark: "#1a3629",
  indicator: "#7ed4a0",
} as const;

// ── 地图定义 ──
const waterCells = new Set([
  "-5,-2", "-4,-2", "-3,-2", "-5,-1", "-4,-1", "-3,-1",
  "4,2", "5,2", "4,3", "5,3",
]);

const mountainCells = new Set(["-2,2", "-1,2", "0,2", "0,1", "1,1", "3,-2"]);
const rockCells = new Set(["-4,2", "-2,-3", "2,-2", "3,2", "5,0", "1,3", "-5,1"]);
const treeCells = new Set([
  "-5,3", "-5,0", "-4,3", "-4,1", "-3,3", "-3,1", "-3,0", "-2,-2",
  "-2,0", "-1,-3", "-1,-1", "0,-3", "0,0", "1,-3", "1,-1", "1,2",
  "2,-3", "2,0", "2,2", "2,3", "3,-3", "3,0", "3,3", "4,-2",
  "4,0", "4,1", "5,-1", "5,1", "-5,-3", "-4,-3",
]);

// ── 解锁顺序：从中心螺旋向外 ──
function buildUnlockOrder(tiles: Array<{ x: number; z: number }>): Map<string, number> {
  const ordered = [...tiles].sort((a, b) => {
    const da = Math.hypot(a.x + 0.5, a.z - 0.3);
    const db = Math.hypot(b.x + 0.5, b.z - 0.3);
    if (Math.abs(da - db) < 0.15) {
      // 同圈按角度排序
      return Math.atan2(a.z - 0.3, a.x + 0.5) - Math.atan2(b.z - 0.3, b.x + 0.5);
    }
    return da - db;
  });
  const map = new Map<string, number>();
  ordered.forEach((t, i) => map.set(`${t.x},${t.z}`, i + 1));
  return map;
}

// ── 生成所有 tile ──
const allTilesRaw: Array<{ x: number; z: number }> = [];
for (let z = -4; z <= 4; z++) {
  for (let x = -6; x <= 6; x++) {
    const edge = Math.abs(x) / 6 + Math.abs(z) / 5;
    const notch = (x === -6 && z < -1) || (x === 6 && z > 1) || (z === 4 && Math.abs(x) > 3);
    if (edge > 1.42 || notch) continue;
    allTilesRaw.push({ x, z });
  }
}

const unlockOrderMap = buildUnlockOrder(allTilesRaw);

const tiles: Tile[] = allTilesRaw.map(({ x, z }) => {
  const key = `${x},${z}`;
  const distanceFromRidge = Math.hypot((x + 0.5) * 0.72, z - 0.6);
  const ridge = Math.max(0, 0.72 - distanceFromRidge * 0.12);
  const variation = ((x * 19 + z * 31 + 80) % 4) * 0.055;
  const isWater = waterCells.has(key);
  const isRock = rockCells.has(key) || mountainCells.has(key);

  return {
    x,
    z,
    height: 0.5 + ((x * 17 + z * 23 + 50) % 4) * 0.06,
    elevation: isWater ? -0.16 : Math.round((ridge + variation) * 10) / 10,
    delay: 0.04 + Math.hypot(x + 4.5, z + 3) * 0.052,
    kind: isWater ? "water" : isRock ? "rock" : (x + z) % 3 === 0 ? "moss" : "forest",
    unlockOrder: unlockOrderMap.get(key) ?? 999,
  };
});

const totalTiles = tiles.length;

// ── 今日新增标记 — 醒目的金色光环+大量漂浮粒子 ──
function NewTileSparkle({ color }: { color: string }) {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    // 粒子浮动 — 不同粒子不同幅度和频率
    group.current.children.forEach((child, i) => {
      if (i === 0) return; // 跳过光环（index 0）
      const offset = Math.sin(t * 2.0 + i * 0.9) * (0.06 + (i % 3) * 0.04);
      child.position.y = 0.22 + offset;
    });
    // 光环呼吸
    const breathe = 1 + Math.sin(t * 1.2) * 0.1;
    group.current.scale.setScalar(breathe);
    // 光环旋转
    const ringChild = group.current.children[0];
    if (ringChild) ringChild.rotation.z += 0.004;
  });

  return (
    <group ref={group}>
      {/* 底部旋转光环（更粗更亮） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.22, 0.34, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={2} />
      </mesh>
      {/* 中心发光球 */}
      <mesh position={[0, 0.15, 0]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshBasicMaterial color="#fffef0" transparent opacity={0.9} />
      </mesh>
      {/* 外层光晕 */}
      <mesh position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      {/* 漂浮粒子 — 8颗，更大 */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 0.3;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              0.22,
              Math.sin(angle) * radius,
            ]}
          >
            <sphereGeometry args={[0.05, 6, 4]} />
            <meshBasicMaterial color="#fffbe6" transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── 树(柔和绿色) ──
function RainforestTree({ variant }: { variant: number }) {
  const crown = useRef<Group>(null);

  useFrame((state) => {
    if (!crown.current) return;
    crown.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8 + variant * 0.7) * 0.035;
    crown.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.65 + variant) * 0.018;
  });

  const tall = variant % 3 === 0;
  return (
    <group scale={tall ? 1.08 : 0.88}>
      <mesh castShadow position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.055, 0.09, 0.64, 6]} />
        <meshStandardMaterial color={PALETTE.treeTrunk} roughness={1} />
      </mesh>
      <group ref={crown} position={[0, 0.63, 0]}>
        <mesh castShadow position={[0, 0.08, 0]}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color={PALETTE.treeCrown1} flatShading roughness={0.94} />
        </mesh>
        <mesh castShadow position={[-0.19, -0.02, 0.04]}>
          <icosahedronGeometry args={[0.21, 0]} />
          <meshStandardMaterial color={PALETTE.treeCrown2} flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.2, 0.01, -0.04]}>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color={PALETTE.treeCrown3} flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.05, 0.28, 0.02]}>
          <icosahedronGeometry args={[0.19, 0]} />
          <meshStandardMaterial color={PALETTE.treeCrown4} flatShading roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function Mountain({ variant }: { variant: number }) {
  const height = 0.82 + (variant % 3) * 0.16;
  return (
    <group>
      <mesh castShadow position={[0, height / 2 - 0.01, 0]} rotation={[0, variant * 0.42, 0]}>
        <coneGeometry args={[0.38, height, 5]} />
        <meshStandardMaterial color={PALETTE.mountain1} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.2, height * 0.34, 0.09]} rotation={[0, 0.5, 0]}>
        <coneGeometry args={[0.2, height * 0.6, 5]} />
        <meshStandardMaterial color={PALETTE.mountain2} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[-0.08, height - 0.08, 0]} rotation={[0, variant * 0.42, 0]}>
        <coneGeometry args={[0.1, 0.19, 5]} />
        <meshStandardMaterial color={PALETTE.mountainSnow} flatShading roughness={0.95} />
      </mesh>
    </group>
  );
}

function Fern({ variant }: { variant: number }) {
  return (
    <group rotation={[0, variant * 0.65, 0]}>
      {[0, 1, 2, 3, 4].map((leaf) => (
        <mesh
          key={leaf}
          castShadow
          position={[Math.cos(leaf * 1.26) * 0.1, 0.1, Math.sin(leaf * 1.26) * 0.1]}
          rotation={[0.35, -leaf * 1.26, 0.65]}
        >
          <coneGeometry args={[0.055, 0.28, 4]} />
          <meshStandardMaterial
            color={leaf % 2 ? PALETTE.fern1 : PALETTE.fern2}
            flatShading
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

function JungleRock({ variant }: { variant: number }) {
  return (
    <group rotation={[0, variant * 0.8, 0]}>
      <mesh castShadow position={[0, 0.13, 0]} scale={[1, 0.72, 0.82]}>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color={PALETTE.rock1} flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.13, 0.07, 0.09]} scale={0.55}>
        <dodecahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color={PALETTE.rock2} flatShading roughness={1} />
      </mesh>
    </group>
  );
}

function PondDetails({ variant }: { variant: number }) {
  return (
    <group>
      <mesh position={[-0.12, 0.035, 0.06]} rotation={[-Math.PI / 2, 0, variant * 0.7]}>
        <circleGeometry args={[0.085, 7]} />
        <meshStandardMaterial color={PALETTE.pond} roughness={0.75} />
      </mesh>
      {variant % 2 === 0 && (
        <mesh position={[0.13, 0.055, -0.09]}>
          <sphereGeometry args={[0.035, 7, 5]} />
          <meshStandardMaterial color={PALETTE.pondFlower} emissive="#7a4058" emissiveIntensity={0.2} />
        </mesh>
      )}
    </group>
  );
}

function TileDecoration({ tile, index }: { tile: Tile; index: number }) {
  const key = `${tile.x},${tile.z}`;
  if (mountainCells.has(key)) return <Mountain variant={index} />;
  if (treeCells.has(key)) return <RainforestTree variant={index} />;
  if (rockCells.has(key)) return <JungleRock variant={index} />;
  if (tile.kind === "water") return <PondDetails variant={index} />;
  if ((tile.x * 7 + tile.z * 11 + 30) % 3 !== 0) return <Fern variant={index} />;
  return null;
}

// ── 单个地块：生长动画 + 今日标记 ──
function GrowingTile({
  tile,
  index,
  reducedMotion,
  isUnlocked,
  isTodayNew,
}: {
  tile: Tile;
  index: number;
  reducedMotion: boolean;
  isUnlocked: boolean;
  isTodayNew: boolean;
}) {
  const group = useRef<Group>(null);
  const hovered = useRef(false);
  const hoverOffset = useRef(0);
  const baseY = -tile.height + tile.elevation;

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!isUnlocked) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    const raw = reducedMotion ? 1 : MathUtils.clamp((state.clock.elapsedTime - tile.delay) / 0.62, 0, 1);
    const progress = 1 - Math.pow(1 - raw, 3);
    hoverOffset.current = MathUtils.damp(hoverOffset.current, hovered.current ? 0.3 : 0, 10, delta);
    group.current.position.y = baseY + hoverOffset.current;
    group.current.scale.set(0.72 + progress * 0.28, Math.max(progress, 0.001), 0.72 + progress * 0.28);
  });

  const topColor =
    tile.kind === "water"
      ? PALETTE.waterTop
      : tile.kind === "rock"
        ? PALETTE.rockTop
        : tile.kind === "moss"
          ? PALETTE.mossTop
          : PALETTE.forestTop;

  return (
    <group
      ref={group}
      position={[tile.x * UNIT, baseY, tile.z * UNIT]}
      scale={[0.72, 0.001, 0.72]}
      onPointerOver={(event) => {
        event.stopPropagation();
        hovered.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hovered.current = false;
        document.body.style.cursor = "default";
      }}
    >
      <mesh castShadow receiveShadow position={[0, tile.height / 2, 0]}>
        <boxGeometry args={[UNIT * 0.94, tile.height, UNIT * 0.94]} />
        <meshStandardMaterial color={PALETTE.tileSide} roughness={0.96} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, tile.height + 0.025, 0]}>
        <boxGeometry args={[UNIT * 0.94, 0.055, UNIT * 0.94]} />
        <meshStandardMaterial
          color={topColor}
          emissive={tile.kind === "water" ? "#124f4a" : "#000000"}
          emissiveIntensity={tile.kind === "water" ? 0.45 : 0}
          roughness={tile.kind === "water" ? 0.34 : 0.9}
        />
      </mesh>
      <group position={[0, tile.height + 0.065, 0]}>
        <TileDecoration tile={tile} index={index} />
      </group>
      {/* 今日新增标记 */}
      {isTodayNew && (
        <group position={[0, tile.height + 0.35, 0]}>
          <NewTileSparkle color="#fff9c4" />
        </group>
      )}
    </group>
  );
}

// ── 主岛 ──
function Island({
  unlockedCount,
  todayCount,
}: {
  unlockedCount: number;
  todayCount: number;
}) {
  const island = useRef<Group>(null);
  const reducedMotion = useReducedMotion();

  useFrame((state) => {
    if (!island.current || reducedMotion) return;
    island.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.035;
  });

  // 按解锁顺序排序，今天新增的是最后 todayCount 个
  const todayStartOrder = Math.max(1, unlockedCount - todayCount + 1);

  return (
    <group ref={island} rotation={[0, -0.22, 0]}>
      {tiles.map((tile, index) => {
        const isUnlocked = tile.unlockOrder <= unlockedCount;
        const isTodayNew =
          todayCount > 0 &&
          tile.unlockOrder >= todayStartOrder &&
          tile.unlockOrder <= unlockedCount;
        return (
          <GrowingTile
            key={`${tile.x}-${tile.z}`}
            tile={tile}
            index={index}
            reducedMotion={reducedMotion}
            isUnlocked={isUnlocked}
            isTodayNew={isTodayNew}
          />
        );
      })}
    </group>
  );
}

// ── 工具 ──
function useReducedMotion() {
  return useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
}

// ── 导出组件 ──
type LearningIslandProps = {
  totalCheckins?: number;
  streak?: number;
  totalHours?: number;
  /** 今日新增打卡次数（用于标记今天长出的地块） */
  todayCheckins?: number;
};

export function LearningIsland({
  totalCheckins = 0,
  streak = 0,
  totalHours = 0,
  todayCheckins = 0,
}: LearningIslandProps) {
  // 最少显示 3 块（中心初始地块），最多 totalTiles 块
  const unlockedCount = Math.min(totalTiles, Math.max(3, totalCheckins));

  return (
    <div
      className="relative h-full min-h-[390px] w-full touch-none"
      role="img"
      aria-label={`可旋转的雨林山地小岛，累计 ${totalCheckins} 次打卡，连续 ${streak} 天，学习 ${Math.round(totalHours * 10) / 10} 小时`}
    >
      <Canvas
        dpr={[1, 1.65]}
        shadows
        orthographic
        camera={{ position: [8, 8, 9], zoom: 70, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.45} />
        <hemisphereLight args={["#d4f0e0", "#0d241a", 1.35]} />
        <directionalLight
          castShadow
          position={[5, 10, 4]}
          intensity={2.2}
          color="#f0faf0"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <Island unlockedCount={unlockedCount} todayCount={todayCheckins} />
        <ContactShadows
          position={[0, -0.9, 0]}
          opacity={0.42}
          scale={10}
          blur={2.5}
          far={5}
          color="#010906"
        />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3.5}
          maxPolarAngle={Math.PI / 2.55}
          minAzimuthAngle={-Math.PI / 3.5}
          maxAzimuthAngle={Math.PI / 3.5}
          target={[0, 0.18, 0]}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 text-xs text-white/55">
        <span className="h-1.5 w-1.5 rounded-full bg-[#7ed4a0]" />
        悬停抬升 · 拖动查看
      </div>
    </div>
  );
}
