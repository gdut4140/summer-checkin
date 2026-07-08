export default function GlobalLoading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary animate-pulse" />
          <span className="text-lg font-semibold text-muted-foreground">
            Loading...
          </span>
        </div>
      </div>
    </div>
  );
}
