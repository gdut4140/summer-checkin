import {
  Brain,
  CalendarCheck,
  Check,
  Leaf,
  Sparkle,
  Target,
} from "@phosphor-icons/react/dist/ssr";

const loadingSteps = [
  { label: "学习空间", icon: Leaf },
  { label: "今日节奏", icon: CalendarCheck },
  { label: "AI 伙伴", icon: Brain },
];

export default function GlobalLoading() {
  return (
    <main className="global-loading relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(215,239,131,0.11),transparent_28%),linear-gradient(180deg,rgba(5,18,13,0.18),rgba(5,18,13,0.62))]" />
      <div className="pointer-events-none absolute left-1/2 top-[19%] h-px w-[min(72vw,720px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/35 to-transparent" />

      <section className="relative z-10 w-full max-w-[520px] text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-[22px] border border-primary/25 bg-primary/12 text-primary shadow-[0_0_0_8px_rgba(215,239,131,0.04),0_18px_55px_rgba(0,0,0,0.22)]">
          <Leaf className="size-8" weight="fill" />
        </div>

        <div className="mt-7 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
          <Sparkle className="size-3" weight="fill" />
          <span>Summer Checkin</span>
          <Sparkle className="size-3" weight="fill" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white/90 sm:text-[30px]">
          正在把你的学习空间点亮
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/48">
          同步计划、专注记录与 AI 伙伴，马上回到你熟悉的节奏。
        </p>

        <div className="mx-auto mt-10 max-w-[420px] text-left">
          <div className="mb-3 flex items-center justify-between text-[11px] text-white/45">
            <span className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              正在准备你的工作台
            </span>
            <span className="text-primary/75">加载中</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 animate-[loading-progress_1.8s_ease-in-out_infinite] rounded-full bg-primary shadow-[0_0_18px_rgba(215,239,131,0.55)]" />
          </div>

          <div className="mt-7 grid grid-cols-3 gap-2">
            {loadingSteps.map(({ label, icon: Icon }, index) => (
              <div
                key={label}
                className="flex min-h-16 flex-col items-center justify-center gap-2 border-t border-white/10 pt-3 text-center"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.07] text-primary/75">
                  {index === 0 ? <Check className="size-3.5" weight="bold" /> : <Icon className="size-4" weight="duotone" />}
                </span>
                <span className="text-[11px] text-white/42">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-[11px] text-white/28">
          <Target className="size-3.5 text-primary/60" weight="duotone" />
          <span>每一次专注，都留下生长的痕迹</span>
        </div>
      </section>

      <style>{`
        @keyframes loading-progress {
          0% { transform: translateX(-105%); }
          45%, 70% { transform: translateX(10%); }
          100% { transform: translateX(160%); }
        }
      `}</style>
    </main>
  );
}
