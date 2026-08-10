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
    <Card className="border-0 bg-transparent shadow-none backdrop-blur-none">
      <CardHeader className="px-0">
        <CardTitle className="text-2xl font-semibold text-white">欢迎回来</CardTitle>
        <CardDescription>登录后继续今天的学习节奏</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5 px-0">
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
        <CardFooter className="flex flex-col gap-4 px-0">
          <Button type="submit" className="w-full text-[black]" disabled={loading}>
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
