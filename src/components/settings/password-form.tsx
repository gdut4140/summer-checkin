"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function PasswordForm() {
  async function handleAction(_prev: unknown, formData: FormData) {
    const newPassword = formData.get("newPassword") as string;
    const confirm = formData.get("confirm") as string;
    if (newPassword !== confirm) {
      toast.error("两次输入的密码不一致");
      return { success: false };
    }
    try {
      await changePassword(formData);
      toast.success("密码修改成功");
      const form = document.getElementById("password-form") as HTMLFormElement;
      form?.reset();
      return { success: true };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "密码修改失败");
      return { success: false };
    }
  }

  const [, formAction, pending] = useActionState(handleAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">修改密码</CardTitle>
      </CardHeader>
      <CardContent>
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
