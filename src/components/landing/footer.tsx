import Link from "next/link";
import { Leaf } from "@phosphor-icons/react/dist/ssr";

export function Footer() {
  return (
    <footer className="border-t border-white/18 bg-[#071f1a]/76 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Leaf className="h-5 w-5 text-[#f3c969]" weight="fill" />
          Summer Checkin AI
        </div>
        <div className="flex items-center gap-6 text-sm text-white/64">
          <Link href="/login" className="transition-colors hover:text-white">登录</Link>
          <Link href="/register" className="transition-colors hover:text-white">注册</Link>
        </div>
        <p className="text-sm text-white/54">为每一个认真成长的夏天。</p>
      </div>
    </footer>
  );
}
