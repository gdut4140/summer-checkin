import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { DocChunk } from "@/lib/rag/retriever";

// PROVIDER_CONFIG 是模块级 const，在 import 时就读 process.env。
// CI 里没有 .env，不在这里兜一个假 key 的话，rerank 链会被 apiKey 过滤成空，
// 所有涉及链的用例都会以"无可用的模型"失败——那测的就不是被测逻辑了。
process.env.EMBEDDING_API_KEY ||= "unit-test-placeholder-key";

/**
 * 取一份全新的模块实例。
 *
 * ⚠️ 很贵：`rag/rerank → retriever → prisma → 生成的 Prisma Client` 这条链有
 * 数万行，重新求值一次要几百毫秒。所以只在**真正需要干净进程内状态**的用例里调，
 * 其余用例共用 beforeAll 加载的那一份。
 *
 * model-pool 的 exhaustedModels / rateLimitedUntil 是进程内状态且没有复位接口，
 * 不重置的话"标为耗尽"的用例会污染后续用例。
 */
async function load() {
  vi.resetModules();
  const pool = await import("@/lib/model-pool");
  const rerank = await import("@/lib/rag/rerank");
  return { pool, rerank };
}

let pool: typeof import("@/lib/model-pool");
let rerank: typeof import("@/lib/rag/rerank");

beforeAll(async () => {
  ({ pool, rerank } = await load());
}, 60_000);

/** 造一个 DocChunk，只需要 id / content / similarity 参与重排逻辑 */
function chunk(id: string, content: string, similarity = 0.5): DocChunk {
  return {
    id,
    sourceName: "t.md",
    sourceType: "text",
    chunkIndex: 0,
    content,
    createdAt: new Date(),
    similarity,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const NATIVE_OK = (scores: number[]) => ({
  output: { results: scores.map((s, i) => ({ index: i, relevance_score: s })) },
  usage: { total_tokens: 12 },
  request_id: "req-1",
});

beforeEach(() => {
  vi.unstubAllGlobals();
  // 熔断标志是模块级的，会跨用例残留，每个用例前复位
  rerank.__resetRerankDisabled();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
describe("buildRerankBody", () => {
  it("原生协议：嵌套 input/parameters，且不返回文档正文", async () => {
    const body = pool.buildRerankBody("dashscope-native", "qwen3-rerank", "q", ["a", "b"], 2);
    expect(body.model).toBe("qwen3-rerank");
    expect(body.input).toEqual({ query: "q", documents: ["a", "b"] });
    expect(body.parameters).toEqual({ return_documents: false, top_n: 2 });
    // 扁平字段绝不能同时出现在原生体里
    expect(body).not.toHaveProperty("query");
    expect(body).not.toHaveProperty("documents");
    expect(body).not.toHaveProperty("top_n");
  });

  it("兼容协议：扁平，且没有 input/parameters/return_documents", async () => {
    const body = pool.buildRerankBody("openai-compatible", "qwen3-rerank", "q", ["a"], 1);
    expect(body).toEqual({ model: "qwen3-rerank", query: "q", documents: ["a"], top_n: 1 });
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("parameters");
  });

  it("instruct 缺省时键不存在（不是 undefined）", async () => {
    const native = pool.buildRerankBody("dashscope-native", "m", "q", ["a"], 1);
    expect(Object.keys(native.parameters as object)).not.toContain("instruct");
    const compat = pool.buildRerankBody("openai-compatible", "m", "q", ["a"], 1);
    expect(Object.keys(compat)).not.toContain("instruct");
  });

  it("传了 instruct 时落进对应层级", async () => {
    const native = pool.buildRerankBody("dashscope-native", "m", "q", ["a"], 1, "X");
    expect((native.parameters as Record<string, unknown>).instruct).toBe("X");
    const compat = pool.buildRerankBody("openai-compatible", "m", "q", ["a"], 1, "X");
    expect(compat.instruct).toBe("X");
  });
});

// ============================================================
describe("parseRerankResponse", () => {
  it("解析嵌套信封（原生）", async () => {
    const scores = pool.parseRerankResponse(NATIVE_OK([0.9, 0.1]), 2);
    expect(scores).toEqual([
      { index: 0, score: 0.9 },
      { index: 1, score: 0.1 },
    ]);
  });

  it("解析扁平信封（兼容）—— 少一层 output", async () => {
    const scores = pool.parseRerankResponse(
      { object: "list", model: "m", results: [{ index: 1, relevance_score: 0.4 }] },
      2
    );
    expect(scores).toEqual([{ index: 1, score: 0.4 }]);
  });

  // 这条是整个模块最重要的断言：拿不到合法 results 必须抛，不能退化成空数组。
  // 退化的后果是排序保持原样（V8 的 sort 在全等 key 下稳定），输出恰好是向量序、
  // 日志却宣称重排已生效——正好复现项目里被删掉的那个空转重排。
  it("两种信封都没有 → 抛错，而不是返回空数组", async () => {
    expect(() => pool.parseRerankResponse({ nonsense: true }, 3)).toThrow(/找不到 results 数组/);
    expect(() => pool.parseRerankResponse(null, 3)).toThrow(/找不到 results 数组/);
    expect(() => pool.parseRerankResponse({ output: {} }, 3)).toThrow(/找不到 results 数组/);
  });

  it("results 为空数组 → 抛错", async () => {
    expect(() => pool.parseRerankResponse({ output: { results: [] } }, 3)).toThrow(/空 results/);
  });

  it("relevance_score 缺失或非数字 → 抛错", async () => {
    expect(() => pool.parseRerankResponse({ output: { results: [{ index: 0 }] } }, 1)).toThrow(
      /relevance_score/
    );
    // 网关把数字序列化成字符串是很常见的
    expect(() =>
      pool.parseRerankResponse({ output: { results: [{ index: 0, relevance_score: "0.93" }] } }, 1)
    ).toThrow(/relevance_score/);
    expect(() =>
      pool.parseRerankResponse({ output: { results: [{ index: 0, relevance_score: NaN }] } }, 1)
    ).toThrow(/relevance_score/);
  });

  it("index 非整数 / 越界 / 重复 → 抛错", async () => {
    expect(() =>
      pool.parseRerankResponse({ output: { results: [{ index: 0.5, relevance_score: 1 }] } }, 1)
    ).toThrow(/index 不是整数/);
    expect(() =>
      pool.parseRerankResponse({ output: { results: [{ index: 5, relevance_score: 1 }] } }, 3)
    ).toThrow(/越界/);
    expect(() =>
      pool.parseRerankResponse(
        { output: { results: [{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 2 }] } },
        3
      )
    ).toThrow(/重复的 index/);
  });

  it("全部分数相同 → 不抛，仅告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(pool.parseRerankResponse(NATIVE_OK([0.5, 0.5, 0.5]), 3)).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ============================================================
describe("orderByRerank", () => {
  it("按重排分降序，未打分的追加在尾部且保持原序", async () => {
    const cs = [chunk("a", "A"), chunk("b", "B"), chunk("c", "C")];
    const ordered = rerank.orderByRerank(cs, [
      { index: 2, score: 0.9 },
      { index: 1, score: 0.1 },
    ]);
    // c 最高、b 次之、a 没分 → 尾部
    expect(ordered.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("部分覆盖（只回了前 2 篇的分）不丢候选", async () => {
    const cs = [chunk("a", "A"), chunk("b", "B"), chunk("c", "C"), chunk("d", "D")];
    const ordered = rerank.orderByRerank(cs, [
      { index: 1, score: 0.9 },
      { index: 0, score: 0.5 },
    ]);
    expect(ordered).toHaveLength(4);
    expect(ordered.map((c) => c.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("空分数 → 原序", async () => {
    const cs = [chunk("a", "A"), chunk("b", "B")];
    expect(rerank.orderByRerank(cs, []).map((c) => c.id)).toEqual(["a", "b"]);
  });

  // 同分不确定会让 verify-pgvector 的降序断言变成随机红灯
  it("同分回落原始向量序（确定性）", async () => {
    const cs = [chunk("a", "A"), chunk("b", "B"), chunk("c", "C")];
    const ordered = rerank.orderByRerank(cs, [
      { index: 2, score: 0.5 },
      { index: 0, score: 0.5 },
      { index: 1, score: 0.5 },
    ]);
    expect(ordered.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("不修改入参数组", async () => {
    const cs = [chunk("a", "A"), chunk("b", "B")];
    const before = cs.map((c) => c.id);
    rerank.orderByRerank(cs, [{ index: 1, score: 0.9 }]);
    expect(cs.map((c) => c.id)).toEqual(before);
  });
});

// ============================================================
describe("clampRerankDocuments", () => {
  it("小输入不裁剪", async () => {
    const r = rerank.clampRerankDocuments(["a", "b"]);
    expect(r).toEqual({ docs: ["a", "b"], truncatedCount: 0, truncatedChars: 0 });
  });

  it("超出数量上限时截取前缀", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = rerank.clampRerankDocuments(["a", "b", "c", "d"], 2, 100);
    expect(r.docs).toEqual(["a", "b"]);
    expect(r.truncatedCount).toBe(2);
    warn.mockRestore();
  });

  it("超出单篇长度时截断", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = rerank.clampRerankDocuments(["abcdef"], 10, 3);
    expect(r.docs).toEqual(["abc"]);
    expect(r.truncatedChars).toBe(1);
    warn.mockRestore();
  });
});

// ============================================================
// 这一组锁的是方案里的最高风险项：
// 裸 fetch 不会因 4xx/5xx 抛错，而 isQuotaError 要匹配的
// AllocationQuota.FreeTierOnly 只存在于 403 的**响应体**里。
// 若 rerankOnce 不在 !res.ok 时抛出并带上 body，模型永远不会被标记 exhausted，
// 于是每次搜索都重试一个死模型、且零报错。
describe("rerankWithFallback 的降级与错误分类", () => {
  const ENTRY_ARGS: [string, string[]] = ["查询", ["文档一", "文档二"]];

  it("成功路径：返回分数与使用的模型", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      jsonResponse(NATIVE_OK([0.9, 0.2]))
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await pool.rerankWithFallback(...ENTRY_ARGS);
    expect(res.model).toBe("qwen3-rerank");
    expect(res.data).toEqual([
      { index: 0, score: 0.9 },
      { index: 1, score: 0.2 },
    ]);
    // top_n 必须传满，否则拿不到完整排列
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.parameters.top_n).toBe(2);
  });

  it("🔴 403 + 额度 body → 抛出，且该模型被标记耗尽、不再重试", async () => {
    // 这条会污染进程内状态（标记模型耗尽且无法复位），所以单独取一份干净实例
    const { pool: fresh } = await load();
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { code: "AllocationQuota.FreeTierOnly", message: "Free allocated quota exceeded." },
        403
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    // 第一次：两个模型都是 403 → 抛
    await expect(fresh.rerankWithFallback(...ENTRY_ARGS)).rejects.toThrow(/HTTP 403/);
    // 两个模型各试一次
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 第二次：两个都已被标记耗尽 → 链空，连 fetch 都不该再发
    fetchMock.mockClear();
    await expect(fresh.rerankWithFallback(...ENTRY_ARGS)).rejects.toThrow(/无可用的模型/);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);

  it("429 → 标为限流而非永久耗尽，并降级到下一个模型", async () => {
    const { pool: fresh } = await load();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model;
      if (model === "qwen3-rerank") {
        return jsonResponse({ code: "Throttling", message: "Requests rate limit exceeded" }, 429);
      }
      return jsonResponse(NATIVE_OK([0.7, 0.3]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fresh.rerankWithFallback(...ENTRY_ARGS);
    expect(res.model).toBe("qwen3.7-text-rerank");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 与 403 的关键区别：限流是**暂时**的，模型没有被踢出链。
    // 所以第二次调用不会像 403 那样抛"无可用的模型"，而是照常返回结果。
    // （qwen3-rerank 仍在默认 60s 冷却里，所以这次仍走兜底模型——这正是限流的语义，
    //   不是 bug，故此处不断言用的是哪一个。）
    fetchMock.mockClear();
    const again = await fresh.rerankWithFallback(...ENTRY_ARGS);
    expect(again.data.length).toBeGreaterThan(0);
  }, 60_000);

  it("200 但响应形状非法 → 抛错，且不降级（形状错误会稳定复现）", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pool.rerankWithFallback(...ENTRY_ARGS)).rejects.toThrow(/找不到 results 数组/);
    // 形状类错误不是额度错误 → 立即上抛，不该把第二个模型也试一遍
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("空文档列表直接返回空，不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await pool.rerankWithFallback("查询", []);
    expect(res.data).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ============================================================
describe("rerankChunks 的降级行为", () => {
  it("重排失败时返回 null（调用方据此降级为向量序）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "boom" }, 500))
    );
    const out = await rerank.rerankChunks("查询", [chunk("a", "A"), chunk("b", "B")]);
    expect(out).toBeNull();
  });

  it("成功后同时返回排序结果与 id→分数映射", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(NATIVE_OK([0.1, 0.9])))
    );
    const out = await rerank.rerankChunks("查询", [chunk("a", "A"), chunk("b", "B")]);
    expect(out).not.toBeNull();
    expect(out!.ordered.map((c) => c.id)).toEqual(["b", "a"]);
    expect(out!.scoreById.get("a")).toBe(0.1);
    expect(out!.scoreById.get("b")).toBe(0.9);
    expect(out!.model).toBe("qwen3-rerank");
  });

  it("空候选直接返回 null", async () => {
    expect(await rerank.rerankChunks("查询", [])).toBeNull();
  });

  // 熔断的意义：形状/协议类错误会稳定复现，不关掉的话此后每次搜索
  // 都白付一次注定失败的往返。
  it("非暂时性错误 → 熔断，后续调用直接返回 null 且不再发请求", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ nope: 1 }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const cs = [chunk("a", "A"), chunk("b", "B")];

    expect(await rerank.rerankChunks("查询", cs)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    expect(await rerank.rerankChunks("查询", cs)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled(); // 已熔断，短路
  });

  // 额度错误走的是"本次降级"分支，不是熔断分支。
  // 注意不能用"第二次是否还发请求"来区分——403 会让模型池把模型标记耗尽
  // （设计如此：403 = 免费额度用完），那样第二次本来就不会发请求，
  // 黑盒上跟熔断长得一样。所以这里直接断言走了哪条日志分支。
  it("额度类错误 → 走降级分支，不触发熔断分支", async () => {
    const { rerank: fresh } = await load();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "AllocationQuota.FreeTierOnly" }, 403))
    );

    expect(await fresh.rerankChunks("查询", [chunk("a", "A"), chunk("b", "B")])).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).toMatch(/额度或限流/);
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it("形状类错误 → 走熔断分支（与额度错误区分开）", async () => {
    const { rerank: fresh } = await load();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ nonsense: true }, 200)));

    expect(await fresh.rerankChunks("查询", [chunk("a", "A"), chunk("b", "B")])).toBeNull();
    expect(error.mock.calls.flat().join(" ")).toMatch(/本进程内关闭重排/);
    error.mockRestore();
  });
});
