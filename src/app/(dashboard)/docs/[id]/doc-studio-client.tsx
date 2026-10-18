"use client";

import { useCallback, useRef, useState } from "react";
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
  /** 服务端算好的正文 ETag，用于给条件请求预热（见 docEtagRef 的说明） */
  initialEtag?: string;
  backHref?: string;
  backLabel?: string;
  backNavigation?: "push" | "replace";
}

export function DocStudioClient({
  docId,
  title: initialTitle,
  initialContent,
  initialEtag,
  readOnly = false,
  enableAi,
  backHref = "/docs",
  backLabel = "返回文档列表",
  backNavigation = "push",
}: DocStudioClientProps) {
  const [title, setTitle] = useState(initialTitle);
  const aiEnabled = enableAi ?? !readOnly;

  // 条件请求用的 ETag：GET 和 PATCH 都会回带，客户端每次拿到就更新。
  // 这样「AI 流结束后拉一次正文」这条路径只在**别人改了文档**时才落空 ——
  // 用户自己的自动保存不会让 etag 失效，否则命中率会被自己的编辑打散。
  //
  // ⚠️ 必须用服务端传来的 initialEtag 预热。初始正文是服务端组件给的，客户端从没为
  // 它发过 GET —— 不预热的话，每次打开工作台后的**第一轮** AI 对话带不上
  // If-None-Match，服务端只能回 200，于是正文一字未变也会弹「AI 已更新」。
  const docEtagRef = useRef<string | null>(initialEtag ?? null);
  const rememberEtag = useCallback((res: Response) => {
    const etag = res.headers.get("ETag");
    if (etag) docEtagRef.current = etag;
  }, []);

  const handleSave = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("保存失败");
      rememberEtag(res);
    },
    [docId, rememberEtag]
  );

  const handleRename = useCallback(
    async (nextTitle: string) => {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) throw new Error("重命名失败");
      rememberEtag(res);
      setTitle(nextTitle);
      toast.success("已重命名");
    },
    [docId, rememberEtag]
  );

  const fetchLatest = useCallback(async () => {
    const res = await fetch(`/api/documents/${docId}`, {
      // 关掉浏览器自身的缓存，条件请求由我们显式控制（要能读到 304 本身）
      cache: "no-store",
      headers: docEtagRef.current
        ? { "If-None-Match": docEtagRef.current }
        : undefined,
    });
    // 304 = 正文没变 → 返回 null，让上层整条「替换正文 + 存撤销快照 + 闪一下」都短路
    if (res.status === 304) return null;
    if (!res.ok) throw new Error("拉取文档失败");
    rememberEtag(res);
    const data = (await res.json()) as {
      document?: { content?: string };
    };
    return data.document?.content ?? "";
  }, [docId, rememberEtag]);

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
