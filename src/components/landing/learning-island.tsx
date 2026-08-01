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
};

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

const tiles: Tile[] = [];
for (let z = -4; z <= 4; z++) {
  for (let x = -6; x <= 6; x++) {
    const edge = Math.abs(x) / 6 + Math.abs(z) / 5;
    const notch = (x === -6 && z < -1) || (x === 6 && z > 1) || (z === 4 && Math.abs(x) > 3);
    if (edge > 1.42 || notch) continue;

    const key = `${x},${z}`;
    const distanceFromRidge = Math.hypot((x + 0.5) * 0.72, z - 0.6);
    const ridge = Math.max(0, 0.72 - distanceFromRidge * 0.12);
    const variation = ((x * 19 + z * 31 + 80) % 4) * 0.055;
    const isWater = waterCells.has(key);
    const isRock = rockCells.has(key) || mountainCells.has(key);

    tiles.push({
      x,
      z,
      height: 0.5 + ((x * 17 + z * 23 + 50) % 4) * 0.06,
      elevation: isWater ? -0.16 : Math.round((ridge + variation) * 10) / 10,
      delay: 0.04 + Math.hypot(x + 4.5, z + 3) * 0.052,
      kind: isWater ? "water" : isRock ? "rock" : (x + z) % 3 === 0 ? "moss" : "forest",
    });
  }
}

function useReducedMotion() {
  return useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
}

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
        <meshStandardMaterial color="#684a31" roughness={1} />
      </mesh>
      <group ref={crown} position={[0, 0.63, 0]}>
        <mesh castShadow position={[0, 0.08, 0]}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color={variant % 2 ? "#176346" : "#1d7450"} flatShading roughness={0.94} />
        </mesh>
        <mesh castShadow position={[-0.19, -0.02, 0.04]}>
          <icosahedronGeometry args={[0.21, 0]} />
          <meshStandardMaterial color="#27865b" flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.2, 0.01, -0.04]}>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color="#3b9b68" flatShading roughness={0.92} />
        </mesh>
        <mesh castShadow position={[0.05, 0.28, 0.02]}>
          <icosahedronGeometry args={[0.19, 0]} />
          <meshStandardMaterial color="#56ad75" flatShading roughness={0.9} />
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
        <meshStandardMaterial color="#315c49" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.2, height * 0.34, 0.09]} rotation={[0, 0.5, 0]}>
        <coneGeometry args={[0.2, height * 0.6, 5]} />
        <meshStandardMaterial color="#426c55" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[-0.08, height - 0.08, 0]} rotation={[0, variant * 0.42, 0]}>
        <coneGeometry args={[0.1, 0.19, 5]} />
        <meshStandardMaterial color="#8ebc93" flatShading roughness={0.95} />
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
          <meshStandardMaterial color={leaf % 2 ? "#4da968" : "#65b978"} flatShading roughness={1} />
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
        <meshStandardMaterial color="#4d6658" flatShading roughness={1} />
      </mesh>
      <mesh castShadow position={[0.13, 0.07, 0.09]} scale={0.55}>
        <dodecahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#70906f" flatShading roughness={1} />
      </mesh>
    </group>
  );
}

function PondDetails({ variant }: { variant: number }) {
  return (
    <group>
      <mesh position={[-0.12, 0.035, 0.06]} rotation={[-Math.PI / 2, 0, variant * 0.7]}>
        <circleGeometry args={[0.085, 7]} />
        <meshStandardMaterial color="#75b96b" roughness={0.75} />
      </mesh>
      {variant % 2 === 0 && (
        <mesh position={[0.13, 0.055, -0.09]}>
          <sphereGeometry args={[0.035, 7, 5]} />
          <meshStandardMaterial color="#e5a9bc" emissive="#7a354e" emissiveIntensity={0.2} />
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

function GrowingTile({
  tile,
  index,
  reducedMotion,
}: {
  tile: Tile;
  index: number;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const hovered = useRef(false);
  const hoverOffset = useRef(0);
  const baseY = -tile.height + tile.elevation;

  useFrame((state, delta) => {
    if (!group.current) return;
    const raw = reducedMotion ? 1 : MathUtils.clamp((state.clock.elapsedTime - tile.delay) / 0.62, 0, 1);
    const progress = 1 - Math.pow(1 - raw, 3);
    hoverOffset.current = MathUtils.damp(hoverOffset.current, hovered.current ? 0.3 : 0, 10, delta);
    group.current.position.y = baseY + hoverOffset.current;
    group.current.scale.set(0.72 + progress * 0.28, Math.max(progress, 0.001), 0.72 + progress * 0.28);
  });

  const topColor = tile.kind === "water"
    ? "#3faaa0"
    : tile.kind === "rock"
      ? "#52735e"
      : tile.kind === "moss"
        ? "#5aa86f"
        : "#3f915f";

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
        <meshStandardMaterial color="#10382d" roughness={0.96} />
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
    </group>
  );
}

function Island() {
  const island = useRef<Group>(null);
  const reducedMotion = useReducedMotion();

  useFrame((state) => {
    if (!island.current || reducedMotion) return;
    island.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.035;
  });

  return (
    <group ref={island} rotation={[0, -0.22, 0]}>
      {tiles.map((tile, index) => (
        <GrowingTile
          key={`${tile.x}-${tile.z}`}
          tile={tile}
          index={index}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

type LearningIslandProps = {
  totalCheckins?: number;
  streak?: number;
  totalHours?: number;
};

export function LearningIsland({ totalCheckins = 0, streak = 0, totalHours = 0 }: LearningIslandProps) {
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
        <ambientLight intensity={1.25} />
        <hemisphereLight args={["#c8f1d7", "#061b14", 1.35]} />
        <directionalLight
          castShadow
          position={[5, 10, 4]}
          intensity={2.2}
          color="#eaf6cf"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <Island />
        <ContactShadows position={[0, -0.9, 0]} opacity={0.42} scale={10} blur={2.5} far={5} color="#010906" />
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
        <span className="h-1.5 w-1.5 rounded-full bg-[#67c889]" />
        悬停抬升 · 拖动查看
      </div>
    </div>
  );
}
