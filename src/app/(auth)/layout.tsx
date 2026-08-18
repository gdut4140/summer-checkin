import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { Leaf, ShieldCheck, TrendUp } from "@phosphor-icons/react/dist/ssr";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-[100dvh] items-center px-4 py-8 md:px-8">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-lg border border-white/10 bg-[#06150f]/82 shadow-2xl backdrop-blur-2xl lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="hidden min-h-[640px] flex-col justify-between border-r border-white/8 p-10 lg:flex">
          <Link href="/" className="inline-flex items-center gap-2.5 text-base font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"><Leaf className="h-5 w-5" weight="fill" /></span>
            Summer <span className="-ml-1.5 text-primary">Checkin</span>
          </Link>
          <div className="max-w-lg">
            <p className="product-eyebrow">Your learning habitat</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">让每一次专注，<br />都留下可以看见的生长。</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/44">计划、专注、打卡与智能体协作在同一个安静空间里完成。</p>
          </div>
          <div className="flex gap-8 text-xs text-white/38"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />数据只属于你</span><span className="flex items-center gap-2"><TrendUp className="size-4 text-[#67b4c9]" />持续看见进步</span></div>
        </section>
        <section className="flex min-h-[640px] flex-col justify-center p-5 sm:p-9">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-white lg:hidden"><Leaf className="size-5 text-primary" weight="fill" />Summer Checkin</Link>
          {children}
        </section>
        </div>
    </div>
  );
}
