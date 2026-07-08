"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/app/(dashboard)/actions";
import {
  House,
  CheckCircle,
  CalendarCheck,
  ChartLine,
  ListChecks,
  Trophy,
  User,
  Robot,
  Gear,
  List,
  X,
  SignOut,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { SearchDialog } from "@/components/search-dialog";

interface TopNavProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null;
}

// 主要导航（顶部居中显示），次要项收入用户菜单
const mainNav = [
  { href: "/dashboard", label: "首页" },
  { href: "/checkin", label: "今日打卡" },
  { href: "/plans", label: "学习计划" },
  { href: "/calendar", label: "打卡日历" },
  { href: "/statistics", label: "数据统计" },
  { href: "/ranking", label: "排行榜" },
];

// 移动端抽屉的完整导航（带图标）
const fullNav = [
  { href: "/dashboard", label: "首页", icon: House },
  { href: "/checkin", label: "今日打卡", icon: CheckCircle },
  { href: "/plans", label: "学习计划", icon: ListChecks },
  { href: "/calendar", label: "打卡日历", icon: CalendarCheck },
  { href: "/statistics", label: "数据统计", icon: ChartLine },
  { href: "/ranking", label: "排行榜", icon: Trophy },
  { href: "/ai", label: "AI 助手", icon: Robot },
  { href: "/profile", label: "个人主页", icon: User },
  { href: "/settings", label: "设置", icon: Gear },
];

export function TopNav({ user }: TopNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <>
      <SearchDialog />
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
              SC
            </div>
            <span className="hidden font-semibold text-foreground sm:inline">
              Summer Checkin
            </span>
          </Link>

          {/* 桌面端居中导航 */}
          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-accent/80 text-accent-foreground backdrop-blur-sm"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 右侧：搜索 + AI 助手 + 用户菜单（桌面） */}
          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={() => {
                const event = new KeyboardEvent("keydown", { key: "k", metaKey: true })
                document.dispatchEvent(event)
              }}
              className="flex items-center gap-2 rounded-full border border-border/50 bg-background/50 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm transition-all hover:bg-accent/30 hover:text-foreground hover:shadow-sm"
            >
              <MagnifyingGlass className="h-4 w-4" />
              <span>搜索</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                ⌘K
              </kbd>
            </button>
            <Link href="/ai">
              <Button variant="ghost" size="sm" className="gap-2 rounded-full backdrop-blur-sm hover:bg-accent/30">
                <Robot className="h-4 w-4" weight="fill" />
                AI 助手
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border/50 bg-background/50 py-1 pl-1 pr-2 backdrop-blur-sm transition-all hover:shadow-md hover:border-border">
                <List className="h-4 w-4 text-foreground" />
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 backdrop-blur-xl bg-background/95">
                <div className="flex flex-col gap-0.5 px-2 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {user?.name ?? "用户"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {user?.email ?? ""}
                  </span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <User className="h-4 w-4" />
                  个人主页
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings" />}>
                  <Gear className="h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <SignOut className="h-4 w-4" />
                  <LogoutButton label="退出登录" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        {/* 移动端：汉堡菜单 */}
        <div className="lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="flex items-center gap-2 rounded-full border border-border p-1.5 pr-3">
              <List className="h-4 w-4" />
              <Avatar className="h-6 w-6">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
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
                      {user?.name ?? "用户"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email ?? ""}
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
