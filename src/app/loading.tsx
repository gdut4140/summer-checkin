export default function GlobalLoading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#06150f]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-[#d7ef83]/30 animate-pulse" />
          <span className="text-sm font-medium text-white/45">
            正在进入雨林…
          </span>
        </div>
      </div>
    </div>
  );
}
