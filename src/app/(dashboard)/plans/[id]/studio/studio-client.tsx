"use client";

import { useCallback, useRef } from "react";
import { MarkdownStudio } from "@/components/studio/markdown-studio";

interface StudioClientProps {
  planId: string;
  title: string;
  initialContent: string;
  /** 服务端算好的正文 ETag，用于给条件请求预热（见 planEtagRef 的说明） */
  initialEtag?: string;
  /** 新建计划跳转（?focusAi=1）：进入后自动聚焦 AI 输入框并预填引导语 */
  autoFocusAi?: boolean;
}

export function StudioClient({
  planId,
  title,
  initialContent,
  initialEtag,
  autoFocusAi = false,
}: StudioClientProps) {
  // 条件请求用的 ETag，与 doc-studio-client 同构：GET / PATCH 都回带，客户端拿到就更新，
  // 这样「AI 流结束后拉一次正文」只在**别人改了文档**时才落空。
  //
  // ⚠️ 用服务端传来的 initialEtag 预热：正文由服务端组件给出，客户端不会为它发 GET，
  // 不预热则每次打开工作台后的第一轮 AI 对话必然拿到 200，正文没变也弹「AI 已更新」。
  const planEtagRef = useRef<string | null>(initialEtag ?? null);
  const rememberEtag = useCallback((res: Response) => {
    const etag = res.headers.get("ETag");
    if (etag) planEtagRef.current = etag;
  }, []);

  const handleSave = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: content }),
      });
      if (!res.ok) throw new Error("保存失败");
      rememberEtag(res);
    },
    [planId, rememberEtag]
  );

  const fetchLatest = useCallback(async () => {
    const res = await fetch(`/api/plans/${planId}`, {
      cache: "no-store",
      headers: planEtagRef.current
        ? { "If-None-Match": planEtagRef.current }
        : undefined,
    });
    // 304 = 正文没变 → null，跳过整条「替换正文 + 撤销快照 + 闪一下」
    if (res.status === 304) return null;
    if (!res.ok) throw new Error("拉取文档失败");
    rememberEtag(res);
    const data = (await res.json()) as { document?: string | null };
    return data.document ?? "";
  }, [planId, rememberEtag]);

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
        // 进入工作台直接是专注阅读模式；想对照编辑时点顶栏"专注阅读"切换
        defaultMode="focus"
      />
    </div>
  );
}
