-- 用户 AI token 用量：tokenusage 表（模型池统一记账，每日限额）
CREATE TABLE "tokenusage" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "surface"         TEXT NOT NULL,
  "tier"            TEXT NOT NULL,
  "model"           TEXT NOT NULL,
  "inputTokens"     INTEGER NOT NULL DEFAULT 0,
  "outputTokens"    INTEGER NOT NULL DEFAULT 0,
  "totalTokens"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tokenusage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tokenusage_userId_createdAt_idx" ON "tokenusage" ("userId", "createdAt");

ALTER TABLE "tokenusage"
  ADD CONSTRAINT "tokenusage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
