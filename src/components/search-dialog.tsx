"use client"

import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  House,
  CheckCircle,
  ListChecks,
  CalendarCheck,
  ChartLine,
  Trophy,
  User,
  Robot,
  Gear,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

export function SearchDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="搜索页面或功能..." />
      <CommandList>
        <CommandEmpty>未找到结果</CommandEmpty>
        <CommandGroup heading="页面">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard"))}
          >
            <House className="mr-2 h-4 w-4" />
            首页
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/checkin"))}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            今日打卡
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/plans"))}
          >
            <ListChecks className="mr-2 h-4 w-4" />
            学习计划
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/calendar"))}
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            打卡日历
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/statistics"))}
          >
            <ChartLine className="mr-2 h-4 w-4" />
            数据统计
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/ranking"))}
          >
            <Trophy className="mr-2 h-4 w-4" />
            排行榜
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="账户">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/profile"))}
          >
            <User className="mr-2 h-4 w-4" />
            个人主页
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/ai"))}
          >
            <Robot className="mr-2 h-4 w-4" />
            AI 助手
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/settings"))}
          >
            <Gear className="mr-2 h-4 w-4" />
            设置
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
