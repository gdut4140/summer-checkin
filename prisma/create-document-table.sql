-- 文档工作室 Phase 4：仅创建 document 表（不触碰其他表）
CREATE TABLE IF NOT EXISTS "document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_userId_updatedAt_idx" ON "document"("userId", "updatedAt");

ALTER TABLE "document"
    ADD CONSTRAINT "document_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
