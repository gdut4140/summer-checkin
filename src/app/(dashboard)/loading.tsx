export default function DashboardLoading() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="h-16 border-b border-border bg-background/80 animate-pulse" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="space-y-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-muted rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
