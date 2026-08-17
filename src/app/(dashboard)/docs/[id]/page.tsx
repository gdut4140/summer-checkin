import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DocStudioClient } from "./doc-studio-client";

export const dynamic = "force-dynamic";

export default async function DocStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.userId !== user.id) notFound();

  const indexed = await prisma.documentChunk.findFirst({
    where: {
      userId: user.id,
      sourceName: { in: [`${doc.title}.md`, `${doc.title}.markdown`] },
    },
    select: { id: true },
  });

  return (
    <DocStudioClient
      docId={doc.id}
      title={doc.title}
      initialContent={doc.content}
      readOnly={Boolean(indexed)}
      backHref="/docs"
      backLabel={indexed ? "返回文档列表（已加入知识库，只读）" : "返回文档列表"}
    />
  );
}
