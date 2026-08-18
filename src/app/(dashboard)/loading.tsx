export default function DashboardLoading() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="h-[4.5rem] border-b border-white/8 bg-background/80 animate-pulse" />
      <div className="product-page">
        <div className="space-y-6">
          <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
          <div className="h-9 w-52 bg-white/10 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 bg-white/7 rounded-md animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
