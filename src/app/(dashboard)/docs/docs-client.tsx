"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Books,
  ArrowUpRight,
  FilePlus,
  FileText,
  Plus,
  Spinner,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [deleteTarget, setDeleteTarget] = useState<DocListItem | null>(null);
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
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("已删除");
      setDeleteTarget(null);
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={createDocument}
          disabled={creating}
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="size-4" weight="bold" />
          {creating ? "创建中…" : "新建文档"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-3.5 text-xs font-medium text-foreground transition hover:bg-white/[0.08]"
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
          <FileText className="size-8 text-primary" weight="duotone" />
          <h2 className="mt-4 text-base font-medium text-white">还没有文档</h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-white/42">
            新建一篇，或导入本地的 Markdown 文件，然后用 AI 帮你阅读和修改。
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-white/9 bg-[var(--surface-panel-bg)] backdrop-blur-xl" aria-label="文档列表">
          <div className="hidden grid-cols-[minmax(0,1fr)_10rem_9rem] border-b border-white/8 px-4 py-2.5 text-[10px] uppercase text-white/28 md:grid">
            <span>文档</span>
            <span>最后更新</span>
            <span className="text-right">操作</span>
          </div>
          {docs.map((doc) => (
            <article
              key={doc.id}
              onClick={() => router.push(`/docs/${doc.id}`)}
              className="group grid min-h-20 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/7 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.035] md:grid-cols-[minmax(0,1fr)_10rem_9rem]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/14 bg-primary/7 text-primary transition group-hover:border-primary/28">
                  <FilePlus className="size-4" weight="fill" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{doc.title}</p>
                  <p className="mt-1 text-[11px] text-white/30 md:hidden">{formatTime(doc.updatedAt)}</p>
                </div>
              </div>
              <p className="hidden text-xs text-white/36 md:block">{formatTime(doc.updatedAt)}</p>
              <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label="加入知识库"
                    title="加入知识库（可被 AI 检索）"
                    disabled={indexingId === doc.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void addToKnowledge(doc);
                    }}
                    className="flex size-8 items-center justify-center rounded-md text-white/28 transition hover:bg-white/8 hover:text-primary disabled:opacity-50"
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
                      setDeleteTarget(doc);
                    }}
                    className="flex size-8 items-center justify-center rounded-md text-white/28 transition hover:bg-white/8 hover:text-red-300"
                  >
                    <Trash className="size-4" />
                  </button>
                <ArrowUpRight className="ml-1 size-4 text-white/20 transition group-hover:text-primary" />
              </div>
            </article>
          ))}
        </section>
      )}

      {/* 拖拽导入遮罩 */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary/60 bg-[#0a1a15]/90 px-10 py-8 text-center">
            <UploadSimple className="mx-auto mb-3 size-8 text-primary" />
            <p className="text-sm font-medium text-white">松开以导入文档</p>
            <p className="mt-1 text-xs text-white/45">支持 .md .markdown .txt</p>
          </div>
        </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border border-white/12 bg-background/96 text-white backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>删除这篇文档？</DialogTitle>
            <DialogDescription>“{deleteTarget?.title}”删除后无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteTarget && void removeDocument(deleteTarget.id, deleteTarget.title)}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
