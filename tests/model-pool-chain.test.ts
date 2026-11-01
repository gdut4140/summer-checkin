import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * 「绕过 agnes」到底生不生效？
 *
 * 三条路径都要成立：
 *   1. 没有 Agnes key（空串）→ 链上直接不出现 agnes
 *   2. agnes 被标记耗尽 / 限流冷却 → 选择器直接落到阿里云
 *   3. 运行时 agnes 429 / 网络失败 → completionsWithFallback 自动切阿里云
 *
 * 注意：想彻底下线 agnes 要把 AGNES_API_KEY 设为**空串**，而不是删掉变量——
 * PROVIDER_CONFIG 里是 `AGNES_API_KEY ?? DASHSCOPE_API_KEY`，删掉变量时
 * DASHSCOPE_API_KEY 会接管，agnes 反而仍然是启用的（历史兼容逻辑）。
 */

const savedEnv = {
  agnesKey: process.env.AGNES_API_KEY,
  agnesBase: process.env.AGNES_BASE_URL,
  aliyunKey: process.env.ALIYUN_API_KEY,
};

async function loadPool(agnesKey: string | null) {
  vi.resetModules();
  if (agnesKey === null) delete process.env.AGNES_API_KEY;
  else process.env.AGNES_API_KEY = agnesKey;
  process.env.AGNES_BASE_URL = "https://api.agnes-ai.cn/v1";
  process.env.ALIYUN_API_KEY = "test-aliyun-key";
  return import("@/lib/model-pool");
}

const completion = (content = "ok") => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: "test",
  choices: [
    { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => {
  if (savedEnv.agnesKey === undefined) delete process.env.AGNES_API_KEY;
  else process.env.AGNES_API_KEY = savedEnv.agnesKey;
  if (savedEnv.agnesBase === undefined) delete process.env.AGNES_BASE_URL;
  else process.env.AGNES_BASE_URL = savedEnv.agnesBase;
  if (savedEnv.aliyunKey === undefined) delete process.env.ALIYUN_API_KEY;
  else process.env.ALIYUN_API_KEY = savedEnv.aliyunKey;
});

const ask = (entry: { modelName: string }, client: import("openai").default) =>
  client.chat.completions.create({
    model: entry.modelName,
    messages: [{ role: "user", content: "hi" }],
  });

describe("绕过 agnes 模型链", () => {
  it("AGNES_API_KEY 为空串 → 链上不再有 agnes，第一个是阿里云", async () => {
    const pool = await loadPool("");
    const chain = pool.getChain("low");

    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every((e) => e.provider !== "agnes")).toBe(true);
    expect(chain[0].provider).toBe("aliyun");
  }, 60_000);

  it("agnes 标记耗尽 → pickModel 落到阿里云", async () => {
    const pool = await loadPool("test-agnes-key");
    expect(pool.getChain("low")[0]?.provider).toBe("agnes");

    pool.markModelExhausted("agnes-2.5-flash");
    expect(pool.pickModel("low").provider).toBe("aliyun");
  }, 60_000);

  it("agnes 限流冷却 → pickModel 落到阿里云", async () => {
    const pool = await loadPool("test-agnes-key");
    pool.markModelRateLimited("agnes-2.5-flash", 60_000);
    expect(pool.pickModel("high").provider).toBe("aliyun");
  }, 60_000);

  it("运行时 agnes 429 → completionsWithFallback 切到阿里云", async () => {
    const pool = await loadPool("test-agnes-key");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("api.agnes-ai.cn")) {
          return json(
            { error: { message: "rate limit exceeded", type: "rate_limit_error" } },
            429
          );
        }
        return json(completion());
      })
    );

    const res = await pool.completionsWithFallback("low", ask);

    expect(res.model).toBe("qwen-flash-2025-07-28");
    expect(urls.some((u) => u.includes("api.agnes-ai.cn"))).toBe(true);
    expect(urls.some((u) => u.includes("dashscope"))).toBe(true);
  }, 60_000);

  it("运行时 agnes 网络失败 → completionsWithFallback 切到阿里云", async () => {
    const pool = await loadPool("test-agnes-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("api.agnes-ai.cn")) {
          throw new TypeError("fetch failed");
        }
        return json(completion());
      })
    );

    const res = await pool.completionsWithFallback("low", ask);
    expect(res.model).toBe("qwen-flash-2025-07-28");
  }, 60_000);
});
