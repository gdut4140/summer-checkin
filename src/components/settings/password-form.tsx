"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/components/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function PasswordForm() {
  const router = useRouter();

  async function handleAction(_prev: unknown, formData: FormData) {
    const newPassword = formData.get("newPassword") as string;
    const confirm = formData.get("confirm") as string;
    if (newPassword !== confirm) {
      toast.error("两次输入的密码不一致");
      return { success: false };
    }
    const result = await changePassword(formData);
    if (!result.success) {
      toast.error(result.error);
      return { success: false };
    }
    toast.success("密码已修改，请重新登录");
    router.push("/login");
    return { success: true };
  }

  const [, formAction, pending] = useActionState(handleAction, null);

  return (
    <Card className="surface overflow-hidden">
      <CardHeader className="border-b border-white/8 px-5 py-4">
        <CardTitle className="text-sm">修改密码</CardTitle>
      </CardHeader>
      <CardContent className="p-5 md:p-6">
        <form id="password-form" action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">当前密码</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">确认新密码</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "修改中..." : "修改密码"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
