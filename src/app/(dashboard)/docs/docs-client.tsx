"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Books,
  FilePlus,
  FileText,
  Plus,
  Spinner,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";

interface DocListItem {
  id: string;
  title: string;
  updatedAt: string;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function DocsClient({ documents }: { documents: DocListItem[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState(documents);
  const [creating, setCreating] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (["md", "markdown", "txt"].includes(ext)) {
      await importFile(file);
    } else {
      toast.error(`不支持 .${ext} 格式，仅支持 .md .markdown .txt`);
    }
  }

  async function createDocument() {
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "未命名文档", content: "# 未命名文档\n" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      router.push(`/docs/${data.document.id}`);
    } catch {
      toast.error("创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function importFile(file: File) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success("已导入");
      router.push(`/docs/${data.document.id}`);
    } catch {
      toast.error("导入失败");
    }
  }

  async function removeDocument(id: string, title: string) {
    if (!window.confirm(`删除文档「${title}」？`)) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  async function addToKnowledge(doc: DocListItem) {
    setIndexingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`);
      if (!res.ok) throw new Error("读取失败");
      const data = (await res.json()) as {
        document?: { content?: string };
      };
      const content = data.document?.content ?? "";
      if (content.trim().length < 10) {
        toast.error("文档内容太短，无法加入知识库");
        return;
      }

      const sourceName = `${doc.title}.md`;
      // 已加入过则先删除旧分片（替换语义，避免重复 chunk 污染检索）
      await fetch(`/api/knowledge/documents/${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      }).catch(() => {});

      const form = new FormData();
      form.append(
        "file",
        new File([content], sourceName, { type: "text/markdown" })
      );
      const kbRes = await fetch("/api/knowledge/documents", {
        method: "POST",
        body: form,
      });
      const kbData = (await kbRes.json().catch(() => null)) as {
        chunks?: number;
        error?: string;
      } | null;
      if (!kbRes.ok) throw new Error(kbData?.error ?? "加入失败");

      toast.success(`已加入知识库（${kbData?.chunks ?? 0} 个分片）`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入知识库失败");
    } finally {
      setIndexingId(null);
    }
  }

  return (
    <div
      className="relative"
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }}
      onDrop={handleDrop}
    >
      {/* 操作栏 */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={createDocument}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-[#d7ef83] px-3.5 py-2 text-xs font-semibold text-[#051612] transition hover:bg-[#e5f6a6] disabled:opacity-50"
        >
          <Plus className="size-4" weight="bold" />
          {creating ? "创建中…" : "新建文档"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-foreground transition hover:bg-white/[0.08]"
        >
          <UploadSimple className="size-4" />
          导入 .md
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
        <span className="ml-auto text-xs text-white/34">{docs.length} 篇</span>
      </div>

      {/* 文档网格 */}
      {docs.length === 0 ? (
        <div className="mt-6 flex min-h-64 flex-col items-center justify-center border border-dashed border-white/16 bg-black/10 px-5 text-center">
          <FileText className="size-8 text-[#d7ef83]" weight="duotone" />
          <h2 className="mt-4 text-base font-medium text-white">还没有文档</h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-white/42">
            新建一篇，或导入本地的 Markdown 文件，然后用 AI 帮你阅读和修改。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((doc) => (
            <article
              key={doc.id}
              onClick={() => router.push(`/docs/${doc.id}`)}
              className="group relative flex min-h-36 cursor-pointer flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0a2119]/72 p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#0c281f]/80"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#d7ef83]/10 text-[#d7ef83]">
                  <FilePlus className="size-4" weight="fill" />
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="加入知识库"
                    title="加入知识库（可被 AI 检索）"
                    disabled={indexingId === doc.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void addToKnowledge(doc);
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-white/30 transition hover:bg-white/8 hover:text-[#d7ef83] disabled:opacity-50"
                  >
                    {indexingId === doc.id ? (
                      <Spinner className="size-4 animate-spin" />
                    ) : (
                      <Books className="size-4" weight="fill" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="删除文档"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeDocument(doc.id, doc.title);
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-white/30 transition hover:bg-white/8 hover:text-red-300"
                  >
                    <Trash className="size-4" />
                  </button>
                </div>
              </div>
              <p className="mt-3 truncate text-base font-semibold text-white">
                {doc.title}
              </p>
              <p className="mt-auto pt-3 text-[11px] text-white/36">
                {formatTime(doc.updatedAt)}
              </p>
            </article>
          ))}
        </div>
      )}

      {/* 拖拽导入遮罩 */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-[#d7ef83]/60 bg-[#0a1a15]/90 px-10 py-8 text-center">
            <UploadSimple className="mx-auto mb-3 size-8 text-[#d7ef83]" />
            <p className="text-sm font-medium text-white">松开以导入文档</p>
            <p className="mt-1 text-xs text-white/45">支持 .md .markdown .txt</p>
          </div>
        </div>
      )}
    </div>
  );
}
