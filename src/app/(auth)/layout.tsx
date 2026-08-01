import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";

function IconLeaf({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M223.45 40.07a8 8 0 0 0-7.52-7.52C139.77 27.18 78.38 66.13 64.47 145.1c-5.84 32.38-15.75 57.71-24.47 74.42a8 8 0 0 0 2.37 8.86c28.21 23.37 61.44 27.18 98.82 11.33 41-18 71.33-62 81.27-117.06a8 8 0 0 0-4.64-8.7c-19.36-8.11-42.84-12.22-69.82-12.22-27.33 0-54.19 5.58-78.22 16.25C109 91.02 157.61 54.85 223.45 40.07Z"/></svg>;
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <Link href="/" className="inline-flex items-center gap-2.5 text-xl font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl">
              <IconLeaf className="h-5 w-5" />
            </span>
            Summer Checkin
          </Link>
          <p className="mt-3 text-sm text-white/60">回到你的学习节奏</p>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
