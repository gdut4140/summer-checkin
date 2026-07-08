"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const options = [
    { value: "light", label: "浅色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
    { value: "system", label: "跟随系统", icon: Monitor },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
            theme === option.value
              ? "border-primary bg-primary/5 text-primary"
              : "border-border hover:border-primary/30 text-muted-foreground"
          )}
        >
          <option.icon className="h-6 w-6" weight={theme === option.value ? "fill" : "regular"} />
          <span className="text-sm font-medium">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
