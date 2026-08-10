"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-0 bg-transparent shadow-none backdrop-blur-none">
      <CardHeader className="px-0">
        <CardTitle className="text-2xl font-semibold text-white">建立学习空间</CardTitle>
        <CardDescription>创建账号，开始记录你的成长轨迹</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 px-0">
          <div className="space-y-2">
            <Label htmlFor="name">用户名</Label>
            <Input
              id="name"
              type="text"
              placeholder="你的名字"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              placeholder="至少 8 位字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">确认密码</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="再次输入密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 px-0">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "注册中..." : "注册"}
          </Button>
          <p className="text-sm text-muted-foreground">
            已有账号？
            <Link href="/login" className="text-primary hover:underline font-medium">
              立即登录
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
