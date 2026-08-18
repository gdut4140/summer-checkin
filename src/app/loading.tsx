export default function GlobalLoading() {
  return (
    // bg-black 与 studio-root 兜底 (#050505) 保持一致，确保路由切换→页面真实背景无可见跳色
    <div className="global-loading min-h-[100dvh] flex items-center justify-center" style={{ backgroundColor: "#050505" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-white/10 animate-pulse" />
          <span className="global-loading-text text-sm font-medium text-white/40">
            加载中…
          </span>
        </div>
      </div>
    </div>
  );
}
