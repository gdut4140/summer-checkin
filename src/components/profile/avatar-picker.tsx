"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { USER_AVATAR_PRESETS, type UserAvatarPreset } from "@/lib/avatar-presets";
import { compressAvatarImage } from "@/lib/avatar-compress";
import { Button } from "@/components/ui/button";
import { UploadSimple, Image } from "@phosphor-icons/react";

interface Props {
  current: string | null;
  onSelect: (id: string) => void;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

export function AvatarPicker({ current, onSelect }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState<"preset" | "upload">("preset");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSelect(p: UserAvatarPreset) {
    if (p.id === current) return;
    setSaving(p.id);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: p.id }),
      });
      if (!res.ok) throw new Error("Failed");
      onSelect(p.id);
      toast.success("头像已更新");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(null);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一个文件
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("只支持 PNG / JPG / WebP / GIF");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error("图片不能超过 5MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      // 0. 客户端压缩：GIF 透传，png/jpg/webp 压成 512 方形 WEBP（30~80KB）
      const compressed = await compressAvatarImage(file);
      if (compressed.blob.size > MAX_SIZE) {
        toast.error("图片不能超过 5MB");
        return;
      }

      // 1. 向服务器申请预签名 PUT 地址（ext 用压缩后的输出格式）
      const presignRes = await fetch(`/api/oss/presign?ext=${compressed.ext}`);
      if (!presignRes.ok) throw new Error("presign");
      const { uploadUrl, publicUrl } = (await presignRes.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };

      // 2. 浏览器直传 OSS（Content-Type 必须与签名一致）
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": compressed.type },
        body: compressed.blob,
      });
      if (!putRes.ok) throw new Error(`put ${putRes.status}`);

      // 3. 通知服务器记录头像 URL
      const patchRes = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: publicUrl }),
      });
      if (!patchRes.ok) throw new Error("patch");

      onSelect(publicUrl);
      setFile(null);
      setPreview(null);
      toast.success("头像已更新");
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  const tabBtn = (active: boolean) =>
    "flex-1 rounded-full px-3 py-1.5 text-center transition-colors " +
    (active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground");

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-full bg-foreground/[0.06] p-1 text-xs font-medium">
        <button type="button" className={tabBtn(tab === "preset")} onClick={() => setTab("preset")}>
          预设头像
        </button>
        <button type="button" className={tabBtn(tab === "upload")} onClick={() => setTab("upload")}>
          上传图片
        </button>
      </div>

      {tab === "preset" ? (
        <div className="grid max-h-[62vh] grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5">
          {USER_AVATAR_PRESETS.map((p) => {
            const isActive = current === p.id;
            const isLoading = saving === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                disabled={!!saving}
                className={
                  "aspect-square overflow-hidden rounded-2xl bg-foreground/[0.06] transition-all duration-200 ease-out " +
                  (isActive
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.04] shadow-lg "
                    : "hover:scale-[1.06] hover:ring-1 hover:ring-foreground/25 shadow-sm hover:shadow-md ") +
                  (isLoading ? "animate-pulse" : "")
                }
              >
                <img
                  src={p.src}
                  alt="头像"
                  draggable={false}
                  loading="lazy"
                  className="h-full w-full rounded-2xl object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-4">
          {preview ? (
            <img src={preview} alt="预览" className="size-24 rounded-full object-cover shadow-lg" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/40">
              <Image className="size-10" />
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onFileChange}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <UploadSimple className="size-4 mr-1.5" />
              {file ? "重新选择" : "选择图片"}
            </Button>
            <Button size="sm" onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? "上传中…" : "上传"}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            支持 PNG / JPG / WebP / GIF，≤ 5MB
          </p>
        </div>
      )}
    </div>
  );
}
