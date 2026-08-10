"use client";

const AVATAR_SHAPES: Record<string, { bg: string; shape: string }> = {
  seed:     { bg: "#051612", shape: "🌱" },
  leaf:     { bg: "#0a241e", shape: "🌿" },
  tree:     { bg: "#0d3027", shape: "🌳" },
  water:    { bg: "#0c1f19", shape: "💧" },
  mountain: { bg: "#134236", shape: "⛰️" },
  sun:      { bg: "#1a5c4b", shape: "🌤️" },
  moon:     { bg: "#0a241e", shape: "🌙" },
  flower:   { bg: "#1f735e", shape: "🌸" },
  star:     { bg: "#051612", shape: "⭐" },
  frog:     { bg: "#0d3027", shape: "🐸" },
  owl:      { bg: "#134236", shape: "🦉" },
  fox:      { bg: "#0c1f19", shape: "🦊" },
};

interface Props {
  image: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

export function AppAvatar({ image, name, size = "md" }: Props) {
  const sizeClass = size === "sm" ? "h-7 w-7 text-lg" : size === "lg" ? "h-20 w-20 text-4xl" : "h-9 w-9 text-xl";
  const preset = image && AVATAR_SHAPES[image] ? AVATAR_SHAPES[image] : null;

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${sizeClass}`}
      style={{ backgroundColor: preset?.bg ?? "#0a241e" }}
      title={name}
    >
      {preset?.shape ?? name.charAt(0).toUpperCase()}
    </div>
  );
}
