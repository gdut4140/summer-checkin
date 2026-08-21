"use client";

import { useCallback } from "react";
import { MarkdownStudio } from "@/components/studio/markdown-studio";

interface StudioClientProps {
  planId: string;
  title: string;
  initialContent: string;
  /** 新建计划跳转（?focusAi=1）：进入后自动聚焦 AI 输入框并预填引导语 */
  autoFocusAi?: boolean;
}

export function StudioClient({
  planId,
  title,
  initialContent,
  autoFocusAi = false,
}: StudioClientProps) {
  const handleSave = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: content }),
      });
      if (!res.ok) throw new Error("保存失败");
    },
    [planId]
  );

  const fetchLatest = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}`);
    if (!res.ok) throw new Error("拉取文档失败");
    const data = (await res.json()) as { document?: string | null };
    return data.document ?? "";
  }, [planId]);

  // 返回时后台触发任务拆分（不 await，不阻塞跳转）
  const handleExit = useCallback(async () => {
    await fetch(`/api/plans/${planId}/split`, { method: "POST" });
  }, [planId]);

  return (
    // 全屏覆盖（z-50 盖住 TopNav 与雨林球），上下 100% 占满
    <div className="fixed inset-0 z-50">
      <MarkdownStudio
        document={{ id: planId, title, content: initialContent }}
        onSave={handleSave}
        onExit={handleExit}
        backHref="/plans"
        backLabel="返回计划列表"
        autoFocusAi={autoFocusAi}
        ai={{
          context: { kind: "plan", refId: planId },
          fetchLatest,
        }}
      />
    </div>
  );
}
