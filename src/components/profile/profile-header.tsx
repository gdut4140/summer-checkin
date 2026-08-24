"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PencilSimple, Gear, CalendarBlank } from "@phosphor-icons/react";
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
    // 通知全局（右上角 TopNav 等）立即刷新头像，不依赖 layout 刷新时机
    window.dispatchEvent(new CustomEvent("avatar:changed", { detail: id }));
    router.refresh();
  }, [router]);

  return (
    <>
      <section className="product-panel relative overflow-hidden px-5 py-6 md:px-7 md:py-8">
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/70" />
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
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

            <div className="min-w-0 flex-1">
              <p className="product-eyebrow">Personal space</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{user.name}</h1>
              <p className="mt-0.5 truncate text-sm text-white/42">{user.email}</p>
              {user.bio ? (
                <p className="mt-3 max-w-[60ch] text-sm leading-6 text-white/72">{user.bio}</p>
              ) : (
                <p className="mt-3 text-sm text-white/30">这个人懒懒的，什么都没有写</p>
              )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-white/30">
                <CalendarBlank className="size-3.5" />
                于 {format(user.createdAt, "yyyy 年 M 月")} 加入
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
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
      </section>

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
