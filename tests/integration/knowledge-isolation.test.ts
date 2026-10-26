import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 真实数据库上的隔离集成测试。
//
// 单测里的「跨用户同名互不影响」用的是内存假库；这里用真实 PostgreSQL
// 跑完整的 processKnowledgeText（事务 + advisory lock + raw SQL）和
// searchKnowledge（pgvector + userId 过滤），验证查询层隔离确实生效。
//
// embedding 被替换成固定的单位向量：隔离与覆盖是数据库行为，
// 不需要真实 embedding API，也避免测试依赖网络和额度。

vi.mock("@/lib/rag/client", () => {
  const vector = new Array(1024).fill(0);
  vector[0] = 1;
  return {
    embedTexts: vi.fn(async (texts: string[]) => texts.map(() => [...vector])),
    embedText: vi.fn(async () => [...vector]),
  };
});

let prisma: typeof import("@/lib/prisma").prisma;
let processKnowledgeText: typeof import("@/lib/knowledge-upload").processKnowledgeText;
let searchKnowledge: typeof import("@/lib/rag/search").searchKnowledge;

const suffix = randomUUID().slice(0, 8);
const sourceName = `isolation-${suffix}.md`;
const markerA = "甲用户独有内容：这是甲上传的资料，只应被甲检索到。";
const markerB = "乙用户独有内容：这是乙上传的资料，只应被乙检索到。";
const updatedA = `${markerA}\n\n甲用户补充内容：重新上传后旧分片不应残留。`;

let userA = "";
let userB = "";

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ processKnowledgeText } = await import("@/lib/knowledge-upload"));
  ({ searchKnowledge } = await import("@/lib/rag/search"));

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (err) {
    throw new Error(
      "集成测试需要可用的 PostgreSQL（先运行 docker compose up -d db）",
      { cause: err }
    );
  }

  const a = await prisma.user.create({
    data: { name: "isolation-a", email: `isolation-a-${suffix}@test.local` },
  });
  const b = await prisma.user.create({
    data: { name: "isolation-b", email: `isolation-b-${suffix}@test.local` },
  });
  userA = a.id;
  userB = b.id;
});

afterAll(async () => {
  if (!prisma) return;
  // user 上的外键都是 onDelete: Cascade，删用户即可清掉 chunk / knowledgedoc
  await prisma.user.deleteMany({
    where: { id: { in: [userA, userB].filter(Boolean) } },
  });
  await prisma.$disconnect();
});

describe("知识库跨用户隔离（真实数据库）", () => {
  it("同名文件互不覆盖，检索只返回当前用户的片段", async () => {
    const a = await processKnowledgeText({
      userId: userA,
      text: markerA,
      sourceName,
      sourceType: "text",
    });
    const b = await processKnowledgeText({
      userId: userB,
      text: markerB,
      sourceName,
      sourceType: "text",
    });

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    // B 上传同名文件时不能删掉 A 的分片
    expect(b.replacedChunks).toBe(0);

    const aChunks = await prisma.documentChunk.count({
      where: { userId: userA, sourceName },
    });
    const bChunks = await prisma.documentChunk.count({
      where: { userId: userB, sourceName },
    });
    expect(aChunks).toBeGreaterThan(0);
    expect(bChunks).toBeGreaterThan(0);

    // 原文记录也各自独立
    const aDoc = await prisma.knowledgeDoc.findUnique({
      where: { userId_sourceName: { userId: userA, sourceName } },
    });
    const bDoc = await prisma.knowledgeDoc.findUnique({
      where: { userId_sourceName: { userId: userB, sourceName } },
    });
    expect(aDoc?.content).toBe(markerA);
    expect(bDoc?.content).toBe(markerB);

    // 跨用户的内容绝不能出现在检索结果里
    const aResults = await searchKnowledge(markerA, userA, 5);
    expect(aResults.results.length).toBeGreaterThan(0);
    expect(aResults.results.every((r) => r.content.includes("甲用户"))).toBe(true);
    expect(aResults.results.some((r) => r.content.includes("乙用户"))).toBe(false);

    const bResults = await searchKnowledge(markerB, userB, 5);
    expect(bResults.results.length).toBeGreaterThan(0);
    expect(bResults.results.every((r) => r.content.includes("乙用户"))).toBe(true);
    expect(bResults.results.some((r) => r.content.includes("甲用户"))).toBe(false);

    // 直接查库确认 B 名下不存在 A 的文本
    const leaked = await prisma.documentChunk.count({
      where: { userId: userB, content: { contains: "甲用户" } },
    });
    expect(leaked).toBe(0);
  });

  it("同一用户重新上传同名文档 → 旧分片被替换，不累积", async () => {
    const before = await prisma.documentChunk.count({
      where: { userId: userA, sourceName },
    });

    const result = await processKnowledgeText({
      userId: userA,
      text: updatedA,
      sourceName,
      sourceType: "text",
    });

    expect(result.success).toBe(true);
    expect(result.replacedChunks).toBe(before);

    const after = await prisma.documentChunk.count({
      where: { userId: userA, sourceName },
    });
    expect(after).toBe(result.chunks);

    const contents = await prisma.documentChunk.findMany({
      where: { userId: userA, sourceName },
      select: { content: true },
    });
    expect(contents.every((c) => c.content.includes("甲用户"))).toBe(true);
    expect(contents.some((c) => c.content.includes("重新上传后旧分片不应残留"))).toBe(
      true
    );

    // B 的同名文档不受影响
    const bChunks = await prisma.documentChunk.count({
      where: { userId: userB, sourceName },
    });
    expect(bChunks).toBeGreaterThan(0);
  });
});
