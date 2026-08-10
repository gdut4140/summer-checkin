"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PencilSimple, Gear } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { AppAvatar } from "@/components/ui/app-avatar";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { AvatarPicker } from "./avatar-picker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface Props {
  user: {
    name: string;
    email: string;
    bio: string | null;
    image: string | null;
    createdAt: Date;
  };
}

export function ProfileHeader({ user }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarId, setAvatarId] = useState(user.image);
  const router = useRouter();

  const handleAvatarSelect = useCallback((id: string) => {
    setAvatarId(id);
    setAvatarOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <Card className="surface overflow-hidden">
        <CardContent className="p-5 md:p-7">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={() => setAvatarOpen(true)}
              className="group relative shrink-0"
              title="更换头像"
            >
              <AppAvatar image={avatarId} name={user.name} size="lg" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
                <PencilSimple className="h-5 w-5 text-white" weight="bold" />
              </div>
            </button>

            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">{user.name}</h2>
              <p className="text-sm text-white/50">{user.email}</p>
              {user.bio ? (
                <p className="text-base mt-1.5 max-w-[60ch] text-white/80">{user.bio}</p>
              ) : (
                <p className="text-base mt-1.5 text-white/30">还没有写简介</p>
              )}
              <p className="text-xs text-white/35 mt-2">
                于 {format(user.createdAt, "yyyy 年 M 月")} 加入
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <PencilSimple className="h-4 w-4 mr-1.5" />
                编辑资料
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPwdOpen(true)}>
                <Gear className="h-4 w-4 mr-1.5" />
                修改密码
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogTitle className="text-sm font-semibold">编辑资料</DialogTitle>
          <ProfileForm user={{ name: user.name, bio: user.bio }} />
        </DialogContent>
      </Dialog>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogTitle className="text-sm font-semibold">修改密码</DialogTitle>
          <PasswordForm />
        </DialogContent>
      </Dialog>

      <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-sm font-semibold mb-3">选择头像</DialogTitle>
          <AvatarPicker current={avatarId} onSelect={handleAvatarSelect} />
        </DialogContent>
      </Dialog>
    </>
  );
}
