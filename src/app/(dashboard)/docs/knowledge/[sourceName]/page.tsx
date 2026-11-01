import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DocStudioClient } from "../../[id]/doc-studio-client";

export const dynamic = "force-dynamic";

function toTitle(sourceName: string) {
  return sourceName.replace(/\.(txt|md|markdown|docx|pdf)$/i, "") || sourceName;
}

export default async function KnowledgeDocReadPage({
  params,
}: {
  params: Promise<{ sourceName: string }>;
}) {
  const user = await requireAuth();
  const { sourceName } = await params;
  const decoded = decodeURIComponent(sourceName);

  // 知识库列表对所有 sourceType 都会生成阅读链接（txt/docx/pdf 也会），
  // 这里不能只接受 markdown，否则用户点 .txt/.docx 会直接看到 notFound。
  const [original, chunks] = await Promise.all([
    prisma.knowledgeDoc.findUnique({
      where: { userId_sourceName: { userId: user.id, sourceName: decoded } },
      select: { content: true },
    }),
    prisma.documentChunk.findMany({
      where: {
        userId: user.id,
        sourceName: decoded,
      },
      select: {
        id: true,
        sourceName: true,
        sourceType: true,
        content: true,
        chunkIndex: true,
        createdAt: true,
      },
      orderBy: [{ chunkIndex: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!original && chunks.length === 0) notFound();

  // 优先展示上传时保存的原文；旧数据没有原文则回退用切片拼接
  const content = original?.content ?? chunks.map((c) => c.content).join("\n\n");
  if (!content.trim()) notFound();

  return (
    <DocStudioClient
      docId={`knowledge:${encodeURIComponent(decoded)}`}
      title={toTitle(decoded)}
      initialContent={content}
      readOnly
      backHref="/agent"
      backLabel="返回知识库"
      backNavigation="replace"
    />
  );
}
