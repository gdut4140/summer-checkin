"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MarkdownStudio } from "@/components/studio/markdown-studio";

interface DocStudioClientProps {
  docId: string;
  title: string;
  initialContent: string;
  /** 只读：不可编辑、不可重命名。知识库文档用它（改了会与已切好的分片对不上），文档区不用 */
  readOnly?: boolean;
  /**
   * 是否开放 AI 面板。缺省跟随 readOnly（只读则不开）。
   * 之所以单独留一个开关：「能不能改」和「能不能用 AI」本是两件事，
   * 之前把 AI 绑死在 readOnly 上，导致文档一旦只读就连 AI 一起没了。
   */
  enableAi?: boolean;
  backHref?: string;
  backLabel?: string;
  backNavigation?: "push" | "replace";
}

export function DocStudioClient({
  docId,
  title: initialTitle,
  initialContent,
  readOnly = false,
  enableAi,
  backHref = "/docs",
  backLabel = "返回文档列表",
  backNavigation = "push",
}: DocStudioClientProps) {
  const [title, setTitle] = useState(initialTitle);
  const aiEnabled = enableAi ?? !readOnly;

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
        ai={
          aiEnabled
            ? {
                context: { kind: "doc", refId: docId },
                fetchLatest,
              }
            : undefined
        }
        readOnly={readOnly}
        // 进入文档工作台直接是专注阅读模式；想对照编辑时点顶栏"专注阅读"切换
        defaultMode="focus"
      />
    </div>
  );
}
