"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Sparkle, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function translateError(msg: string): string {
    const map: Record<string, string> = {
      "user already exists": "该邮箱已注册，请直接登录",
      "email already exists": "该邮箱已注册，请直接登录",
      "invalid email": "邮箱格式不正确",
      "password too short": "密码长度不足，至少需要 8 位",
      "weak password": "密码强度不够，请使用更复杂的密码",
      "too many requests": "请求过于频繁，请稍后再试",
    };
    const lower = msg.toLowerCase();
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val;
    }
    return msg || "注册失败，请重试";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      toast.error("密码至少需要 8 位");
      return;
    }
    setLoading(true);
    try {
      let result = await authClient.signUp.email({ name, email, password });
      if (result.error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await authClient.signUp.email({ name, email, password });
      }
      if (result.error) {
        toast.error(translateError(result.error.message || ""));
      } else {
        toast.success("注册成功！欢迎加入 Summer Checkin。");
        router.push("/dashboard");
      }
    } catch {
      toast.error("注册出错，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground lg:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkle className="size-4" weight="fill" />
        </span>
        Summer Checkin
      </Link>

      <div className="mb-8">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkle className="size-3" weight="fill" />
          <span>创建账号</span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight text-foreground">建立你的学习空间</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">开始记录你的成长轨迹</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-xs font-medium text-muted-foreground">用户名</label>
          <input
            id="name"
            type="text"
            placeholder="你的名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 w-full rounded-xl border border-border bg-muted/30 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-muted-foreground">邮箱</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 w-full rounded-xl border border-border bg-muted/30 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-muted-foreground">密码</label>
          <input
            id="password"
            type="password"
            placeholder="至少 8 位字符"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="h-11 w-full rounded-xl border border-border bg-muted/30 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-xs font-medium text-muted-foreground">确认密码</label>
          <input
            id="confirm"
            type="password"
            placeholder="再次输入密码"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="h-11 w-full rounded-xl border border-border bg-muted/30 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              <span>注册中…</span>
            </span>
          ) : (
            <>
              <span>注册</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" weight="bold" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="ml-1 font-medium text-primary hover:underline">立即登录</Link>
      </p>
    </div>
  );
}
