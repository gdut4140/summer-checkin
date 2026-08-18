import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DocStudioClient } from "../../[id]/doc-studio-client";

export const dynamic = "force-dynamic";

function toTitle(sourceName: string) {
  return sourceName.replace(/\.(txt|md|markdown)$/i, "") || sourceName;
}

export default async function KnowledgeDocReadPage({
  params,
}: {
  params: Promise<{ sourceName: string }>;
}) {
  const user = await requireAuth();
  const { sourceName } = await params;
  const decoded = decodeURIComponent(sourceName);

  const chunks = await prisma.documentChunk.findMany({
    where: {
      userId: user.id,
      sourceName: decoded,
      sourceType: { in: ["markdown", "md"] },
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
  });

  if (chunks.length === 0) notFound();

  const fallbackAllowedByExt = /\.(md|markdown)$/i.test(decoded);
  if (!fallbackAllowedByExt) {
    const typeLower = chunks[0].sourceType.toLowerCase();
    if (!["markdown", "md"].includes(typeLower)) {
      notFound();
    }
  }

  const content = chunks.map((c) => c.content).join("\n\n");

  return (
    <DocStudioClient
      docId={`knowledge:${encodeURIComponent(decoded)}`}
      title={toTitle(chunks[0].sourceName)}
      initialContent={content}
      readOnly
      backHref="/agent"
      backLabel="返回知识库"
      backNavigation="replace"
    />
  );
}
