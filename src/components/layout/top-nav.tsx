"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/app/(dashboard)/actions";
import {
  ChartLine,
  Gear,
  ListChecks,
  List,
  X,
  SignOut,
  Leaf,
  Tree,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AppAvatar } from "@/components/ui/app-avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { AmbientSound } from "@/components/dashboard/ambient-sound";

interface TopNavProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

// 主要导航（顶部居中显示），次要项收入用户菜单
const mainNav = [
  { href: "/dashboard", label: "雨林" },
  { href: "/checkin", label: "我的小岛" },
  { href: "/plans", label: "学习计划" },
  { href: "/statistics", label: "个人主页" },
];

// 移动端抽屉的完整导航（带图标）
const fullNav = [
  { href: "/dashboard", label: "雨林", icon: Tree },
  { href: "/checkin", label: "我的小岛", icon: Tree },
  { href: "/plans", label: "学习计划", icon: ListChecks },
  { href: "/statistics", label: "个人主页", icon: ChartLine },
  { href: "/settings", label: "设置", icon: Gear },
];

export function TopNav({ user }: TopNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <>
      <header className="dashboard-nav pointer-events-none sticky top-0 z-40 w-full text-white">
        <div className="dashboard-nav__inner mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/dashboard" className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[#071711]/66 p-1.5 pr-3 text-xs font-semibold shadow-xl backdrop-blur-2xl lg:hidden"><span className="flex size-7 items-center justify-center rounded-full bg-[#d7ef83] text-[#051612]"><Leaf className="size-3.5" weight="fill" /></span>Summer Checkin</Link>
          <div className="atomic-nav pointer-events-auto hidden items-center lg:flex">
            <Link href="/dashboard" className="atomic-nav__brand flex shrink-0 items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#d7ef83] text-[#051612]"><Leaf className="size-4" weight="fill" /></span>
              <span className="whitespace-nowrap text-sm font-semibold">Summer Checkin</span>
            </Link>
            <nav className="atomic-nav__links flex items-center gap-1" aria-label="主导航">
              {mainNav.map((item) => (
                <Link key={item.href} href={item.href} className={cn("rounded-full px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors", isActive(item.href) ? "bg-[#d7ef83] text-[#051612]" : "text-white/52 hover:bg-white/8 hover:text-white")}>{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* 右侧：通知 + 用户菜单（桌面） */}
          <div className="dashboard-nav__tools pointer-events-auto hidden items-center gap-1 rounded-full border border-white/12 bg-[#071711]/66 p-1.5 shadow-xl backdrop-blur-2xl lg:flex">
            <AmbientSound />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="打开用户菜单" className="flex items-center gap-2 rounded-full bg-white/7 py-1 pl-2 pr-1 backdrop-blur-sm transition-all hover:bg-white/12">
                <List className="h-4 w-4 text-white" />
                <AppAvatar image={user.image} name={user.name ?? "U"} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border border-white/10 bg-[#0a1a15]/98 p-1 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center gap-3 px-3 py-3">
                  <AppAvatar image={user.image} name={user.name ?? "U"} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user.name ?? "用户"}</p>
                    <p className="text-[11px] text-white/35 truncate">{user.email ?? ""}</p>
                  </div>
                </div>
                <div className="h-px bg-white/5 mx-2" />
                <LogoutButton />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 移动端：汉堡菜单 */}
          <div className="pointer-events-auto lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger className="flex items-center gap-2 rounded-md border border-white/25 bg-white/10 p-1.5 pr-3 text-white">
                <List className="h-4 w-4" />
                <AppAvatar image={user.image} name={user.name ?? "U"} size="sm" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex h-16 items-center justify-between border-b border-border px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                      SC
                    </div>
                    <span className="font-semibold text-sm">菜单</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <nav className="grid gap-1 p-3">
                  {fullNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        weight={isActive(item.href) ? "fill" : "regular"}
                        className="h-5 w-5"
                      />
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div className="absolute bottom-4 left-0 right-0 px-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.name ?? "用户"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email ?? ""}
                      </p>
                    </div>
                    <LogoutButton />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
