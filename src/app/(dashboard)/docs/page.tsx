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
    <div className="product-page">
      <header className="product-header">
        <div>
          <p className="product-eyebrow">Doc studio</p>
          <h1 className="product-title">文档</h1>
          <p className="product-subtitle">
            导入、编辑你的 Markdown 文档，用 AI 辅助阅读与修改。
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
