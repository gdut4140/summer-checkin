import { describe, expect, it } from "vitest";
import { toPgVector } from "@/lib/rag/retriever";

// 这些测试锁定的是一层**跨语言格式契约**：JS 侧序列化出来的字符串，
// 必须能被 PostgreSQL 侧的 `$n::vector` 直接解析。
//
// 为什么值得单独测：这个契约一旦破了，失败方式很难查——
//   · 写入时整批 INSERT 报错（还算好的）
//   · 或者更糟：格式"看起来对"但值被悄悄改变，检索结果从此不准
// 而它跨越了 JS / pgvector 两套类型系统，编译器管不到。
//
// 历史：这里原先测的是 cosineSimilarity / parseEmbedding——那两个函数
// 是"应用层 JS 余弦检索"的产物，已随 pgvector 迁移删除。余弦计算现在由
// 数据库内的 `<=>` 算子完成，不再有 JS 侧实现需要测。

describe("toPgVector", () => {
  it("输出 pgvector 的向量字面量格式", () => {
    expect(toPgVector([1, 2, 3])).toBe("[1,2,3]");
  });

  it("保留负数与小数", () => {
    expect(toPgVector([-0.5, 0.25, -1])).toBe("[-0.5,0.25,-1]");
  });

  // 无空格是 JSON.stringify 的默认行为，也是 pgvector 输入格式的最简形式。
  // 锁住它：如果有人为了"好看"手写成 join(", ") 拼字符串，空格虽然
  // pgvector 也能容忍，但格式就此偏离 JSON 标准，后续解析全靠运气。
  it("不含空格", () => {
    expect(toPgVector([1, 2, 3])).not.toMatch(/\s/);
  });

  it("以 [ 开头、以 ] 结尾", () => {
    const s = toPgVector([0.1, 0.2]);
    expect(s.startsWith("[")).toBe(true);
    expect(s.endsWith("]")).toBe(true);
  });

  // 生产维度：EMBEDDING_CHAIN 上的 text-embedding-v4 / v3 均为 1024，对应列类型 vector(1024)
  // （v2 / v1 是 1536 维且 v2 忽略 dimensions 参数，不在链上——见 model-pool.ts）
  it("1024 维向量可往返且元素个数正确", () => {
    const vec = Array.from({ length: 1024 }, (_, i) => (i % 7) / 7 - 0.5);
    const s = toPgVector(vec);
    const back = JSON.parse(s) as number[];
    expect(back).toHaveLength(1024);
    expect(back).toEqual(vec);
  });

  // 空向量不是合法输入：pgvector 的 vector 至少要有 1 维，
  // `'[]'::vector` 会直接报错。调用方必须自己挡住空向量
  // （knowledge-upload 挡了 chunks.length === 0，
  //   memory 挡了 vec.length > 0）。这里把该约定写进测试。
  it("空数组产出 []——调用方必须自行拦截，不能直接入库", () => {
    expect(toPgVector([])).toBe("[]");
  });

  it("科学计数法仍被 JSON.parse 正确还原", () => {
    const vec = [1e-7, 1.5e-8];
    expect(JSON.parse(toPgVector(vec))).toEqual(vec);
  });
});
