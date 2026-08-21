import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { Leaf, ShieldCheck, TrendUp, Sparkle } from "@phosphor-icons/react/dist/ssr";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-[100dvh] items-stretch overflow-hidden bg-[#06150f]">
      {/* 左侧 — 视频背景 */}
      <section className="relative hidden min-h-[100dvh] flex-1 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
        {/* 背景视频 */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/rain.mp4" type="video/mp4" />
        </video>
        {/* 暗色遮罩 — 让文字可读 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#06150f]/70 via-[#06150f]/50 to-[#06150f]/80" />

        <div className="relative z-10 flex h-full flex-col justify-between">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2.5 text-base font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Leaf className="h-5 w-5" weight="fill" />
            </span>
            Summer <span className="-ml-1 text-primary">Checkin</span>
          </Link>

          {/* 主文案 */}
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <Sparkle className="size-3" weight="fill" />
              <span>你的学习栖息地</span>
            </div>
            <h1 className="mt-5 max-w-xl text-[42px] font-semibold leading-[1.15] tracking-tight text-white drop-shadow-lg xl:text-[48px]">
              让每一次专注<br />
              <span className="text-primary">都留下生长的痕迹</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-white/60 drop-shadow">
              计划、专注、打卡，与 AI 伙伴雨宝协作，在安静的森林里完成每一天的学习。
            </p>
          </div>

          {/* 底部特性 */}
          <div className="flex gap-6 text-[12px] text-white/40">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              数据只属于你
            </span>
            <span className="flex items-center gap-1.5">
              <TrendUp className="size-4 text-primary/70" />
              看见持续的进步
            </span>
          </div>
        </div>
      </section>

      {/* 右侧 — 表单（窄列） */}
      <section className="relative flex min-h-[100dvh] w-full items-center overflow-hidden bg-background lg:w-[480px] lg:shrink-0 xl:w-[520px]">
        {/* 移动端视频背景 */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover lg:hidden"
        >
          <source src="/rain.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[#06150f]/85 lg:hidden" />

        {/* Logo for mobile */}
        <Link href="/" className="absolute left-6 top-6 z-20 inline-flex items-center gap-2 text-sm font-semibold text-white lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="size-4" weight="fill" />
          </span>
          Summer Checkin
        </Link>

        {/* 表单容器 — 保持内容宽度，直接融入右侧背景 */}
        <div className="relative z-10 w-full px-5 py-24 sm:px-10 lg:px-12 lg:py-16">
          <div className="mx-auto w-full max-w-[360px] px-1 sm:px-0">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
