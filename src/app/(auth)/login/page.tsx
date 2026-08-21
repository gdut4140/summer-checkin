"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Sparkle, Eye, EyeSlash, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function translateError(msg: string): string {
    const map: Record<string, string> = {
      "invalid email or password": "邮箱或密码错误",
      "user not found": "用户不存在",
      "invalid credentials": "邮箱或密码错误",
      "email not verified": "邮箱未验证，请先验证邮箱",
      "too many requests": "请求过于频繁，请稍后再试",
    };
    const lower = msg.toLowerCase();
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key)) return val;
    }
    return msg || "登录失败";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let result = await authClient.signIn.email({ email, password });
      if (result.error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await authClient.signIn.email({ email, password });
      }
      if (result.error) {
        toast.error(translateError(result.error.message || ""));
      } else {
        toast.success("欢迎回来！");
        const redirectTo = searchParams.get("redirect") || "/dashboard";
        router.push(redirectTo);
      }
    } catch {
      toast.error("登录出错，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkle className="size-3" weight="fill" />
          <span>欢迎回到学习栖息地</span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">继续你的学习节奏</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">登录后，今天的计划和专注记录会接着上次继续。</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-foreground/70">邮箱地址</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 w-full rounded-xl border border-border/80 bg-background/40 px-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/60 focus:bg-background/70 focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-foreground/70">密码</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="输入密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-12 w-full rounded-xl border border-border/80 bg-background/40 px-4 pr-11 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/60 focus:bg-background/70 focus:ring-4 focus:ring-primary/10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {showPassword ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              <span>登录中…</span>
            </span>
          ) : (
            <>
              <span>登录</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" weight="bold" />
            </>
          )}
        </button>
      </form>

      <div className="mt-7 flex items-center gap-3 text-[11px] text-muted-foreground/70 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        <span>安全登录，数据只属于你</span>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        还没有账号？
        <Link href="/register" className="ml-1 font-medium text-primary hover:underline">立即注册</Link>
      </p>
    </div>
  );
}
