"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  File,
  FileText,
  Plus,
  Spinner,
  Trash,
  Upload,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---- 类型 ----

interface DocInfo {
  sourceName: string;
  sourceType: string;
  chunkCount: number;
  totalChars: number;
  createdAt: string;
}

// ---- 工具 ----

const typeLabel: Record<string, string> = {
  text: "文本",
  txt: "文本",
  markdown: "Markdown",
  md: "Markdown",
  pdf: "PDF",
  docx: "Word",
};

function canViewDoc(sourceType: string, sourceName: string) {
  const normalized = sourceType.toLowerCase();
  if (["markdown", "md"].includes(normalized)) return true;
  return /\.(md|markdown)$/i.test(sourceName);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

// ---- 主组件 ----

export function KnowledgeBase() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 加载文档列表
  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/documents");
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents);
      }
    } catch {
      // 静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // 上传文件
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/knowledge/documents", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (res.ok && result.success) {
          toast.success(`已上传 "${file.name}" (${result.chunks} 个分片)`);
          await loadDocs();
        } else {
          toast.error(result.error ?? "上传失败");
        }
      } catch {
        toast.error("上传失败，请重试");
      } finally {
        setUploading(false);
      }
    },
    [loadDocs]
  );

  // 粘贴文本
  const submitPaste = useCallback(async () => {
    if (!pasteText.trim() || pasteText.trim().length < 10) {
      toast.error("文本太短，至少 10 个字符");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, name: pasteName || undefined }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success(`已保存 (${result.chunks} 个分片)`);
        setPasteText("");
        setPasteName("");
        setPasteOpen(false);
        await loadDocs();
      } else {
        toast.error(result.error ?? "保存失败");
      }
    } catch {
      toast.error("保存失败，请重试");
    } finally {
      setUploading(false);
    }
  }, [pasteText, pasteName, loadDocs]);

  // 删除文档
  const deleteDoc = useCallback(
    async (sourceName: string) => {
      try {
        const res = await fetch(
          `/api/knowledge/documents/${encodeURIComponent(sourceName)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          toast.success(`已删除 "${sourceName}"`);
          await loadDocs();
        }
      } catch {
        toast.error("删除失败");
      }
    },
    [loadDocs]
  );

  // 拖拽处理
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (["txt", "md", "pdf", "docx"].includes(ext)) {
          void uploadFile(file);
        } else {
          toast.error(`不支持 .${ext} 格式`);
        }
      }
    },
    [uploadFile]
  );

  const viewDoc = useCallback(
    (doc: DocInfo) => {
      if (!canViewDoc(doc.sourceType, doc.sourceName)) {
        toast.error("当前仅支持查看 markdown 文档");
        return;
      }
      router.push(`/docs/knowledge/${encodeURIComponent(doc.sourceName)}`);
    },
    [router]
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── 上传区 ── */}
      <div className="border-b border-white/10 p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-lg border-2 border-dashed p-4 text-center transition",
            dragOver
              ? "border-[#d7ef83]/60 bg-[#d7ef83]/6"
              : "border-white/12 hover:border-white/20"
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Spinner className="size-5 animate-spin text-[#d7ef83]" />
              <span className="text-xs text-white/50">处理中…</span>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-2 size-5 text-white/30" />
              <p className="text-xs text-white/50">
                拖拽文件到此处，或点击下方按钮
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-white/15 text-[11px] text-white/60 hover:bg-white/8"
                  onClick={() => fileRef.current?.click()}
                >
                  <File className="size-3" />
                  上传文件
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-white/15 text-[11px] text-white/60 hover:bg-white/8"
                  onClick={() => setPasteOpen(!pasteOpen)}
                >
                  <FileText className="size-3" />
                  粘贴文本
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-white/25">
                支持 .txt .md .pdf .docx
              </p>
            </>
          )}
        </div>

        {/* 文本粘贴区 */}
        {pasteOpen && (
          <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/4 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">粘贴文本</span>
              <button
                onClick={() => setPasteOpen(false)}
                className="text-white/30 hover:text-white"
              >
                <X className="size-3" />
              </button>
            </div>
            <input
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="文档名称（可选）"
              className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-[#d7ef83]/40 focus:outline-none"
            />
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="在此粘贴 Markdown 或纯文本…"
              className="min-h-24 resize-none border-white/10 bg-white/5 text-xs focus-visible:ring-[#d7ef83]/30"
              disabled={uploading}
            />
            <Button
              size="sm"
              className="h-7 w-full gap-1 bg-[#d7ef83] text-[11px] text-[#10271e] hover:bg-[#e5f6a6]"
              onClick={submitPaste}
              disabled={uploading || !pasteText.trim()}
            >
              <Plus className="size-3" />
              保存到知识库
            </Button>
          </div>
        )}
      </div>

      {/* ── 文档列表 ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className="text-[11px] font-medium text-white/38">
            文档列表
          </p>
          <span className="text-[10px] text-white/25">{docs.length} 个</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-5 animate-spin text-white/20" />
          </div>
        ) : docs.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-white/32">
            还没有上传任何文档
            <br />
            上传文档后 AI 可以直接基于它们回答
          </p>
        ) : (
          <div className="space-y-1 px-3 pb-4">
            {docs.map((doc) => (
              <div
                key={doc.sourceName}
                className="group flex items-start gap-3 rounded-lg border border-white/6 bg-white/3 p-3 hover:border-white/10"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/8 text-white/40">
                  <File className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white/78">
                    {doc.sourceName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
                    <span>{typeLabel[doc.sourceType] ?? doc.sourceType}</span>
                    <span>·</span>
                    <span>{doc.chunkCount} 分片</span>
                    <span>·</span>
                    <span>{formatBytes(doc.totalChars)}</span>
                    <span>·</span>
                    <span>{timeAgo(doc.createdAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canViewDoc(doc.sourceType, doc.sourceName) && (
                    <button
                      onClick={() => viewDoc(doc)}
                      className="rounded p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-[#d7ef83] group-hover:opacity-100"
                      title="查看文档"
                    >
                      <Eye className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteDoc(doc.sourceName)}
                    className="rounded p-1 text-white/20 opacity-0 transition hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                    title="删除文档"
                  >
                    <Trash className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
