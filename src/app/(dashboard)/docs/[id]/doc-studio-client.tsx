"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MarkdownStudio } from "@/components/studio/markdown-studio";

interface DocStudioClientProps {
  docId: string;
  title: string;
  initialContent: string;
  readOnly?: boolean;
  backHref?: string;
  backLabel?: string;
  backNavigation?: "push" | "replace";
}

export function DocStudioClient({
  docId,
  title: initialTitle,
  initialContent,
  readOnly = false,
  backHref = "/docs",
  backLabel = "返回文档列表",
  backNavigation = "push",
}: DocStudioClientProps) {
  const [title, setTitle] = useState(initialTitle);

  const handleSave = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("保存失败");
    },
    [docId]
  );

  const handleRename = useCallback(
    async (nextTitle: string) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) throw new Error("重命名失败");
      setTitle(nextTitle);
      toast.success("已重命名");
    },
    [docId]
  );

  const fetchLatest = useCallback(async () => {
    const res = await fetch(`/api/documents/${docId}`);
    if (!res.ok) throw new Error("拉取文档失败");
    const data = (await res.json()) as {
      document?: { content?: string };
    };
    return data.document?.content ?? "";
  }, [docId]);

  return (
    // 全屏覆盖（z-50 盖住 TopNav 与雨林球），上下 100% 占满
    <div className="fixed inset-0 z-50">
      <MarkdownStudio
        document={{ id: docId, title, content: initialContent }}
        onSave={handleSave}
        onRename={readOnly ? undefined : handleRename}
        backHref={backHref}
        backLabel={backLabel}
        backNavigation={backNavigation}
        ai={readOnly ? undefined : {
          context: { kind: "doc", refId: docId },
          fetchLatest,
        }}
        readOnly={readOnly}
        // 进入文档工作台直接是专注阅读模式；想对照编辑时点顶栏"专注阅读"切换
        defaultMode="focus"
      />
    </div>
  );
}
