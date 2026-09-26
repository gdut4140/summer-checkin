import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DocStudioClient } from "./doc-studio-client";

export const dynamic = "force-dynamic";

/**
 * 文档区阅读/编辑页。
 *
 * 与知识库**完全独立**：文档区的文档不进知识库，也不受知识库影响。
 * 这里曾经有一段「按标题去 documentchunk 里反查，查到就设成只读」的逻辑，
 * 结果是文档一旦被加进知识库就变成只读、连 AI 面板也一起没了；而且靠标题匹配很脆，
 * 改个名字就断链、同名文档会一起被锁。现在两边的列表和生命周期彻底分开：
 *   · 文档区（/docs）：可编辑、可重命名、开放 AI
 *   · 知识库（/agent 里的知识库面板）：自己上传、自己管理，阅读页走 /docs/knowledge/*
 */
export default async function DocStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.userId !== user.id) notFound();

  return (
    <DocStudioClient
      docId={doc.id}
      title={doc.title}
      initialContent={doc.content}
      backHref="/docs"
      backLabel="返回文档列表"
    />
  );
}
