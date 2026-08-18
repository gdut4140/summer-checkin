import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DocsClient } from "./docs-client";

export default async function DocsPage() {
  const user = await requireAuth();
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="product-page product-page--redesigned">
      <header className="product-header">
        <div>
          <p className="product-eyebrow">Doc studio</p>
          <h1 className="product-title">文档</h1>
          <p className="product-subtitle">
            写作、阅读与知识库整理集中在一个安静的工作空间。
          </p>
        </div>
      </header>

      <DocsClient
        documents={docs.map((d) => ({
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
