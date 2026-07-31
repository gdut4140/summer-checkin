"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // 多标签页场景下，cookie 可能被另一标签页覆盖导致 CSRF 校验失败，
      // 重试一次让 better-auth 自动刷新 token
      let result = await authClient.signIn.email({ email, password });
      if (result.error) {
        // 等待短暂时间后重试一次（让 cookie 状态稳定）
        await new Promise((resolve) => setTimeout(resolve, 500));
        result = await authClient.signIn.email({ email, password });
      }
      if (result.error) {
        toast.error(result.error.message || "登录失败");
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
    <Card className="glass-panel border-white/60 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">登录</CardTitle>
        <CardDescription>欢迎回到你的学习之旅</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
          <p className="text-sm text-muted-foreground">
            还没有账号？
            <Link href="/register" className="text-primary hover:underline font-medium">
              立即注册
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
