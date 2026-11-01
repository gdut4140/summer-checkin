import { Skeleton } from "@/components/ui/skeleton";

// /agent 的服务端入口需要 await requireAuth；客户端还要拉会话、历史和知识库。
// 这里覆盖“页面还没出来”的那段时间，避免白屏。
export default function AgentLoading() {
  return (
    <div
      className="rainforest-workbench--page w-full text-white"
      aria-busy="true"
      aria-label="正在加载智能体"
    >
      <aside className="rainforest-panel rainforest-panel--left">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <Skeleton className="size-9 rounded-md bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24 bg-white/10" />
            <Skeleton className="h-2.5 w-32 bg-white/6" />
          </div>
        </div>
        <div className="p-3">
          <Skeleton className="h-9 w-full rounded-md bg-white/8" />
        </div>
        <div className="px-3 pb-2">
          <Skeleton className="h-2.5 w-16 bg-white/6" />
        </div>
        <div className="space-y-1 px-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-md bg-white/4" />
          ))}
        </div>
        <div className="mt-4 px-5 pb-2">
          <Skeleton className="h-2.5 w-20 bg-white/6" />
        </div>
        <div className="space-y-1 px-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2 px-2.5 py-2">
              <Skeleton
                className="h-3 bg-white/8"
                style={{ width: `${58 + ((index * 17) % 34)}%` }}
              />
              <Skeleton className="h-2.5 w-1/4 bg-white/5" />
            </div>
          ))}
        </div>
      </aside>

      <section className="rainforest-panel rainforest-panel--center">
        <header className="flex h-16 items-center gap-3 border-b border-white/10 px-4 sm:px-5">
          <Skeleton className="size-8 rounded-md bg-white/8" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20 bg-white/10" />
            <Skeleton className="h-2.5 w-32 bg-white/6" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-5 sm:px-7">
          <div className="mx-auto max-w-3xl space-y-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={index % 2 === 0 ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    index % 2 === 0
                      ? "w-2/5 space-y-2.5 rounded-lg border border-white/6 bg-white/4 p-4"
                      : "w-4/5 space-y-2.5 rounded-lg border border-white/6 bg-white/4 p-4"
                  }
                >
                  <Skeleton className="h-3 w-full bg-white/7" />
                  <Skeleton className="h-3 w-4/5 bg-white/6" />
                  <Skeleton className="h-3 w-3/5 bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/10 p-3 sm:p-4">
          <Skeleton className="mx-auto h-24 max-w-3xl rounded-lg bg-white/5" />
        </div>
      </section>

      <aside className="rainforest-panel rainforest-panel--right">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          <Skeleton className="size-4 rounded bg-white/8" />
          <Skeleton className="h-3.5 w-16 bg-white/10" />
        </div>
        <div className="space-y-1 px-3 pt-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border border-white/6 bg-white/3 p-3"
            >
              <Skeleton className="size-8 shrink-0 rounded-md bg-white/8" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton
                  className="h-3 bg-white/8"
                  style={{ width: `${55 + ((index * 13) % 35)}%` }}
                />
                <Skeleton className="h-2.5 w-2/5 bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
