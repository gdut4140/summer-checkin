import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// 知识库上传的核心风险不是「能不能传上去」，而是**覆盖时会不会新旧混杂**：
// 旧分片残留 → 检索同时命中修订前后的内容；事务只包一半 → 分片写成功、原文没更新。
// 真实数据库的回滚由 Postgres 保证，这里用一个「只在提交时生效」的内存假库，
// 锁住的是我们自己的结构：所有写操作都必须在同一个事务里、失败时一行都不落库。

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn() },
}));
vi.mock("@/lib/rag/client", () => ({
  embedTexts: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { embedTexts } from "@/lib/rag/client";
import { processKnowledgeText } from "@/lib/knowledge-upload";
import {
  KnowledgeLimitError,
  MAX_CHUNK_COUNT,
  MAX_TEXT_CHARS,
} from "@/lib/knowledge-upload-guard";

// ---- 内存假库 ----

interface FakeChunk {
  userId: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  embedding: string;
  createdAt: Date;
}

interface FakeDoc {
  userId: string;
  sourceName: string;
  sourceType: string;
  content: string;
}

interface FakeDb {
  chunks: FakeChunk[];
  docs: FakeDoc[];
}

function cloneDb(src: FakeDb): FakeDb {
  return {
    chunks: src.chunks.map((c) => ({ ...c })),
    docs: src.docs.map((d) => ({ ...d })),
  };
}

/** 模拟交互式事务客户端；所有写操作只作用于 staged，提交时才替换真库 */
function makeTx(staged: FakeDb) {
  let insertSeq = 0;

  return {
    $executeRawUnsafe: vi.fn(async (sql: string, ...args: unknown[]) => {
      // advisory lock 返回 void，生产代码用 $executeRaw 只为拿副作用
      if (/pg_advisory_xact_lock/i.test(sql)) return 0;
      if (!/INSERT INTO documentchunk/i.test(sql)) {
        throw new Error(`测试未预期的 SQL: ${sql}`);
      }
      const [
        ,
        userId,
        sourceName,
        sourceType,
        chunkIndex,
        content,
        embedding,
        createdAt,
      ] = args as [
        string,
        string,
        string,
        string,
        number,
        string,
        string,
        Date,
      ];
      insertSeq += 1;
      if (failInsertAt !== null && insertSeq === failInsertAt) {
        throw new Error("模拟写库失败");
      }
      staged.chunks.push({
        userId,
        sourceName,
        sourceType,
        chunkIndex,
        content,
        embedding,
        createdAt,
      });
      return 1;
    }),
    documentChunk: {
      deleteMany: vi.fn(
        async ({ where }: { where: { userId: string; sourceName: string } }) => {
          const before = staged.chunks.length;
          staged.chunks = staged.chunks.filter(
            (c) =>
              !(c.userId === where.userId && c.sourceName === where.sourceName)
          );
          return { count: before - staged.chunks.length };
        }
      ),
    },
    knowledgeDoc: {
      upsert: vi.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { userId_sourceName: { userId: string; sourceName: string } };
          update: { sourceType: string; content: string };
          create: FakeDoc;
        }) => {
          const { userId, sourceName } = where.userId_sourceName;
          const existing = staged.docs.find(
            (d) => d.userId === userId && d.sourceName === sourceName
          );
          if (existing) Object.assign(existing, update);
          else staged.docs.push({ ...create });
          return existing ?? create;
        }
      ),
    },
  };
}

type Tx = ReturnType<typeof makeTx>;

const mockTransaction = prisma.$transaction as unknown as Mock<
  (cb: (tx: Tx) => Promise<unknown>) => Promise<unknown>
>;
const mockEmbed = vi.mocked(embedTexts);

let db: FakeDb;
let lastTx: Tx | undefined;
let failInsertAt: number | null;

beforeEach(() => {
  db = { chunks: [], docs: [] };
  lastTx = undefined;
  failInsertAt = null;

  mockEmbed.mockReset();
  mockEmbed.mockImplementation(async (texts: string[]) =>
    texts.map((_, i) => [0.1 + i, 0.2, 0.3])
  );

  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (cb) => {
    const staged = cloneDb(db);
    const tx = makeTx(staged);
    lastTx = tx;
    const result = await cb(tx); // 抛错 → staged 丢弃，等价于事务回滚
    db = staged;
    return result;
  });
});

/** 生成 n 个 ## 小节，保证 splitMarkdown 切出 n 个分片 */
function md(sections: number, marker: string): string {
  return Array.from(
    { length: sections },
    (_, i) => `## 第${i + 1}节\n\n${marker}的内容 ${i + 1}。`
  ).join("\n\n");
}

function upload(
  userId: string,
  sourceName: string,
  text: string
) {
  return processKnowledgeText({
    userId,
    text,
    sourceName,
    sourceType: "markdown",
  });
}

describe("processKnowledgeText — 覆盖写库", () => {
  it("首次上传 → 分片与原文都写入，没有旧分片可覆盖", async () => {
    const text = md(2, "初始");

    const result = await upload("u1", "笔记.md", text);

    expect(result).toMatchObject({
      success: true,
      sourceName: "笔记.md",
      chunks: 2,
      replacedChunks: 0,
    });
    expect(db.chunks).toHaveLength(2);
    expect(db.chunks.map((c) => c.chunkIndex)).toEqual([0, 1]);
    expect(db.docs).toEqual([
      { userId: "u1", sourceName: "笔记.md", sourceType: "markdown", content: text },
    ]);
  });

  it("同名覆盖 → 旧分片全部被替换，不残留（这是之前缺的一步）", async () => {
    await upload("u1", "笔记.md", md(3, "旧版"));

    const result = await upload("u1", "笔记.md", md(1, "修订版"));

    expect(result.chunks).toBe(1);
    expect(result.replacedChunks).toBe(3);
    expect(db.chunks).toHaveLength(1);
    expect(db.chunks[0].content).toContain("修订版");
    expect(db.chunks[0].content).not.toContain("旧版");
    expect(db.docs).toHaveLength(1);
    expect(db.docs[0].content).toContain("修订版");
  });

  it("向量生成失败 → 抛错，旧文档原样保留，且根本没开事务", async () => {
    await upload("u1", "笔记.md", md(2, "旧版"));
    const before = cloneDb(db);
    const txCallsBefore = mockTransaction.mock.calls.length;

    mockEmbed.mockRejectedValueOnce(new Error("embedding API 503"));
    await expect(upload("u1", "笔记.md", md(3, "新版"))).rejects.toThrow(
      "embedding API 503"
    );

    expect(db).toEqual(before);
    expect(mockTransaction.mock.calls.length).toBe(txCallsBefore);
  });

  it("事务中途写库失败 → 整体回滚，旧文档原样保留", async () => {
    await upload("u1", "笔记.md", md(2, "旧版"));
    const before = cloneDb(db);

    failInsertAt = 2; // 第 2 个 INSERT 失败（删除和第 1 个 INSERT 已经在 staged 里）
    await expect(upload("u1", "笔记.md", md(3, "新版"))).rejects.toThrow(
      "模拟写库失败"
    );

    expect(db).toEqual(before);
  });

  it("向量数量与分片数量不一致 → 拒绝写入", async () => {
    const before = cloneDb(db);

    mockEmbed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    await expect(upload("u1", "笔记.md", md(2, "任意"))).rejects.toThrow(
      "数量不一致"
    );

    expect(db).toEqual(before);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("不同用户上传同名文件互不影响", async () => {
    const r1 = await upload("u1", "同名.md", md(1, "甲的"));
    const r2 = await upload("u2", "同名.md", md(2, "乙的"));

    expect(r1.replacedChunks).toBe(0);
    expect(r2.replacedChunks).toBe(0); // 不能删掉别人的同名文档
    expect(db.chunks.filter((c) => c.userId === "u1")).toHaveLength(1);
    expect(db.chunks.filter((c) => c.userId === "u2")).toHaveLength(2);
    expect(db.chunks.filter((c) => c.userId === "u1")[0].content).toContain("甲的");
    expect(db.chunks.filter((c) => c.userId === "u2")[0].content).toContain("乙的");
    expect(db.docs).toHaveLength(2);
  });

  it("文本超过上限 → 抛上限错误，不调用 embedding、不开事务", async () => {
    const before = cloneDb(db);

    await expect(
      processKnowledgeText({
        userId: "u1",
        text: "字".repeat(MAX_TEXT_CHARS + 1),
        sourceName: "超长.txt",
        sourceType: "text",
      })
    ).rejects.toBeInstanceOf(KnowledgeLimitError);

    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(db).toEqual(before);
  });

  it("分片数超过上限 → 抛上限错误，不调用 embedding", async () => {
    const text = Array.from(
      { length: MAX_CHUNK_COUNT + 1 },
      (_, i) => `第${i}段。`
    ).join("\n\n");

    await expect(
      processKnowledgeText({
        userId: "u1",
        text,
        sourceName: "过多.txt",
        sourceType: "text",
      })
    ).rejects.toThrow("分片过多");

    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("先对 (userId, sourceName) 加事务级 advisory lock，再删旧分片", async () => {
    await upload("u1", "笔记.md", md(1, "内容"));

    const [sql, lockUserId, lockSource] = lastTx!.$executeRawUnsafe.mock
      .calls[0] as unknown as [string, string, string];
    expect(sql).toContain("pg_advisory_xact_lock");
    // 用户与文档名作为两个独立参数传入，而不是拼成一个字符串：
    // PostgreSQL 的 text 不允许 0x00，任何「不可见分隔符」方案都可能踩到
    // "invalid byte sequence for encoding UTF8: 0x00"（真实故障）。
    expect(lockUserId).toBe("u1");
    expect(lockSource).toBe("笔记.md");
    for (const v of [lockUserId, lockSource]) {
      expect(v).not.toContain("\u0000");
    }

    // 锁必须在删除之前，否则并发事务仍能同时 DELETE
    expect(lastTx!.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      lastTx!.documentChunk.deleteMany.mock.invocationCallOrder[0]
    );
  });
});
