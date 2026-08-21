-- 知识库原文存储：knowledgedoc 表（与文档系统 document 表互不干扰）
CREATE TABLE "knowledgedoc" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledgedoc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledgedoc_userId_sourceName_key" ON "knowledgedoc" ("userId", "sourceName");
CREATE INDEX "knowledgedoc_userId_idx" ON "knowledgedoc" ("userId");

ALTER TABLE "knowledgedoc"
  ADD CONSTRAINT "knowledgedoc_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
