"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function ProfileForm({ user }: { user: { name: string; bio: string | null } }) {
  async function handleAction(_prev: unknown, formData: FormData) {
    try {
      await updateProfile(formData);
      toast.success("资料已更新");
      return { success: true };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
      return { success: false };
    }
  }

  const [, formAction, pending] = useActionState(handleAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">个人资料</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">用户名</Label>
            <Input id="name" name="name" defaultValue={user.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">个人简介</Label>
            <Textarea
              id="bio"
              name="bio"
              placeholder="介绍一下自己..."
              defaultValue={user.bio ?? ""}
              rows={3}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "保存中..." : "保存修改"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
