import { cn } from "@/lib/utils";

export function RankBadge({ rank }: { rank: number }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
        rank === 1 && "bg-yellow-500 text-white",
        rank === 2 && "bg-gray-300 text-gray-800",
        rank === 3 && "bg-amber-600 text-white",
        rank > 3 && "text-muted-foreground"
      )}
    >
      {rank <= 3 ? rank : rank}
    </div>
  );
}
