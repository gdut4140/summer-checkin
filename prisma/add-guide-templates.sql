-- 新用户引导模板：plantemplate / documenttemplate（注册时克隆给新用户）
CREATE TABLE "plantemplate" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "goal"        TEXT,
  "document"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plantemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documenttemplate" (
  "id"         TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "content"    TEXT NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documenttemplate_pkey" PRIMARY KEY ("id")
);
