import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { Leaf } from "@phosphor-icons/react/dist/ssr";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="scenic-shell relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center text-white">
          <Link href="/" className="inline-flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/35 bg-white/18 backdrop-blur-xl">
              <Leaf className="h-5 w-5" weight="fill" />
            </span>
            Summer Checkin
          </Link>
          <p className="mt-3 text-sm text-white/70">回到你的学习节奏</p>
        </div>
        {children}
      </div>
    </div>
  );
}
