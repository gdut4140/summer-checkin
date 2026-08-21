import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: "size-3.5 border-2",
  md: "size-5 border-[2.5px]",
  lg: "size-7 border-[3px]",
};

export function LoadingSpinner({ size = "md", className, label }: LoadingSpinnerProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "animate-spin rounded-full border-border border-t-primary",
          sizeMap[size]
        )}
      />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

export function LoadingOverlay({ label, children }: { label?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <LoadingSpinner size="lg" />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      {children}
    </div>
  );
}
