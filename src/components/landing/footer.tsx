import Link from "next/link";
import { CalendarCheck, ClockCountdown, Leaf, ListChecks, Sparkle } from "@phosphor-icons/react/dist/ssr";

const steps = [
  { icon: ListChecks, label: "计划" },
  { icon: ClockCountdown, label: "专注" },
  { icon: CalendarCheck, label: "打卡" },
  { icon: Sparkle, label: "AI 复盘" },
];

export function Footer() {
  return (
    <footer id="footer" className="border-t border-[#d7ef83]/15 bg-[#05140f]/95 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 md:px-8">
        {/* 主区 */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d7ef83]/35 bg-[#d7ef83]/15">
              <Leaf className="h-5 w-5 text-[#d7ef83]" weight="fill" />
            </span>
            <span className="text-[15px] font-semibold tracking-wide">Summer Checkin</span>
          </div>

          {/* 四步流程 */}
          <nav className="flex flex-wrap items-center gap-0" aria-label="产品流程">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5 px-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7ef83]/30 bg-[#d7ef83]/10">
                      <Icon className="h-4 w-4 text-[#d7ef83]" weight="duotone" />
                    </div>
                    <span className="text-[11px] text-white/55">{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="h-px w-6 bg-gradient-to-r from-[#d7ef83]/50 to-[#d7ef83]/15 sm:w-10" />
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </footer>
  );
}
