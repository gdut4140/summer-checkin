"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { dailyCheckin } from "./actions";
import { toast } from "sonner";
import { useScene } from "@/context/scene-context";

const MOODS = [
  { value: "", label: "心情（可选）" },
  { value: "开心", label: "😊 开心" },
  { value: "平静", label: "😌 平静" },
  { value: "专注", label: "🎯 专注" },
  { value: "兴奋", label: "🤩 兴奋" },
  { value: "疲惫", label: "😴 疲惫" },
];

export function CheckinButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { scene, copy } = useScene();
  const { visitButtonLabel, visitSuccessToast } = copy;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("图片过大，单张上限 5MB");
      return;
    }
    if (!["image/png","image/jpeg","image/jpg","image/webp","image/gif"].includes(f.type)) {
      toast.error("仅支持 png/jpg/webp/gif");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function uploadScreenshot(f: File): Promise<string | null> {
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const presignRes = await fetch(`/api/oss/presign?ext=${encodeURIComponent(ext)}&purpose=checkins`);
    if (!presignRes.ok) {
      const j = await presignRes.json().catch(()=>({error:"presign failed"}));
      throw new Error(j.error || "预签名失败");
    }
    const { uploadUrl, publicUrl } = await presignRes.json();
    const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
    if (!putRes.ok) throw new Error("上传失败");
    return publicUrl as string;
  }

  async function handleCheckin() {
    setLoading(true);
    try {
      let screenshot: string | undefined = undefined;
      if (file) {
        try {
          screenshot = (await uploadScreenshot(file)) || undefined;
        } catch (e:any) {
          toast.error(e.message || "图片上传失败");
          setLoading(false);
          return;
        }
      }
      const result = await dailyCheckin(mood || undefined, scene, screenshot);
      if (result.success) {
        toast.success(visitSuccessToast);
        setFile(null); setPreview(null); setMood("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        toast.error(result.error || "出错了");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mood}
          onChange={(e)=>setMood(e.target.value)}
          className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/85 backdrop-blur outline-none"
        >
          {MOODS.map(m=> <option key={m.value} value={m.value} className="text-black">{m.label}</option>)}
        </select>

        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" onChange={onPick} className="hidden" id="checkin-file" />
        <label htmlFor="checkin-file" className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/75 hover:bg-white/10">
          {file ? "更换截图" : "上传截图（可选）"}
        </label>
        {file && <span className="text-xs text-white/55 truncate max-w-[140px]">{file.name}</span>}
        {preview && <img src={preview} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-white/12" />}
        {preview && <button onClick={()=>{setFile(null); setPreview(null); if(fileRef.current) fileRef.current.value=""}} className="text-xs text-white/55 hover:text-white/85">移除</button>}
      </div>

      <button
        onClick={handleCheckin}
        disabled={loading}
        data-tour="checkin-button"
        className="group relative inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/20 transition-all hover:bg-primary/92 active:scale-95 disabled:opacity-60"
      >
        <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/0 via-white/10 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/25 border-t-primary-foreground" />
            正在记录
          </>
        ) : (
          <>
            <svg className="relative h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h2" />
              <path d="M6 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3.3-4 7-4 7s-4-3.7-4-7Z" />
              <path d="M20 12h2" />
              <path d="M14 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 3.3-4 7-4 7s-4-3.7-4-7Z" />
            </svg>
            <span className="relative">{visitButtonLabel}</span>
          </>
        )}
      </button>
    </div>
  );
}
