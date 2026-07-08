"use client";

import { MOODS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface MoodPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MOODS.map((mood) => (
        <button
          key={mood.value}
          type="button"
          onClick={() => onChange(mood.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
            value === mood.value
              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
              : "border-border hover:border-primary/30 hover:bg-muted"
          )}
        >
          <span className="text-base">{mood.emoji}</span>
          <span>{mood.label}</span>
        </button>
      ))}
    </div>
  );
}
