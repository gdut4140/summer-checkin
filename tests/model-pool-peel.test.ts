import { describe, expect, it, vi } from "vitest";
import { streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";

// peelFirstChunk 是模型池降级的**唯一**探测点：它在路由返回 Response 之前读流的
// 开头，好让 provider 的 403 / 429 当场抛出，从而切到池内下一个模型。
//
// 它容易写错的地方有两处，两处都真的错过（旧实现两处都踩，导致 /api/ai 的流式
// 链路实际上从来没有降级过——403 被吞成一条空回复）：
//
//   ① start 不算成功。ai@7 的 streamText 在 ReadableStream 的 start() 里**同步**
//      入队 { type: "start" }（node_modules/ai/dist/index.js:8941），那一刻
//      provider 请求还没发出。
//   ② 模型调用失败不 reject，而是吐 { type: "error" } part。旧实现剥的是
//      toTextStream 的输出，而它只透传 text-delta，start 与 error 双双被丢，
//      第一次 read() 就拿到 done。
//
// 下面既测我们自己的剥取逻辑，也用真实 streamText + mock 模型把 SDK 的行为
// **实证**下来——②一旦不成立（比如 SDK 改为 reject），「把 error part 抛出去」
// 这个修法就失效了，这些用例会红。

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { peelFirstChunk } from "@/lib/model-pool";

type Part = { type: string; error?: unknown };

/**
 * 从 mock 的构造签名反推 doStream 的类型。
 * provider 层的 part 类型很宽（光 finish 就要一堆嵌套 usage 字段），而这里只想
 * 造几个最小 part，所以直接照签名断言，避免为了测试数据去依赖传递依赖
 * @ai-sdk/provider。
 */
type MockDoStream = NonNullable<
  NonNullable<ConstructorParameters<typeof MockLanguageModelV3>[0]>["doStream"]
>;

/** 按顺序吐完这些 part 后关闭 */
function streamOf<T>(parts: T[]): ReadableStream<T> {
  let i = 0;
  return new ReadableStream<T>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(parts[i++]);
      else controller.close();
    },
  });
}

async function drain(stream: ReadableStream<Part>): Promise<Part[]> {
  const out: Part[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const QUOTA = new Error("403 AllocationQuota.FreeTierOnly");

describe("peelFirstChunk", () => {
  it("不在 start 处停下——start 早于 provider 请求，不代表成功", async () => {
    // 手工控制第二块的时机：读到 start 之后必须继续等，而不是就此处返回
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stream = new ReadableStream<Part>({
      async pull(controller) {
        controller.enqueue({ type: "start" });
        await gate;
        controller.enqueue({ type: "start-step" });
        controller.close();
      },
    });

    const settled = vi.fn();
    const pending = peelFirstChunk(stream).then(settled);

    await new Promise((r) => setTimeout(r, 20));
    expect(settled).not.toHaveBeenCalled();

    release();
    await pending;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("剥出的 start 会原样重放，不丢块", async () => {
    const parts: Part[] = [
      { type: "start" },
      { type: "start-step" },
      { type: "text-delta" },
      { type: "finish-step" },
      { type: "finish" },
    ];
    const { stream } = await peelFirstChunk(streamOf(parts));
    expect(await drain(stream)).toEqual(parts);
  });

  it("第一块就是 start-step 时立即返回", async () => {
    const parts: Part[] = [{ type: "start-step" }, { type: "text-delta" }];
    const { stream } = await peelFirstChunk(streamOf(parts));
    expect(await drain(stream)).toEqual(parts);
  });

  it("start 之后是 error part：抛出，而不是当成正常流返回", async () => {
    await expect(
      peelFirstChunk(streamOf([{ type: "start" }, { type: "error", error: QUOTA }]))
    ).rejects.toThrow(/AllocationQuota/);
  });

  it("抛的是原始错误对象，message 原样保留（isQuotaError 靠它匹配）", async () => {
    await expect(
      peelFirstChunk(streamOf([{ type: "start" }, { type: "error", error: QUOTA }]))
    ).rejects.toBe(QUOTA);
  });

  it("error part 不是 Error 实例时也归一成 Error", async () => {
    await expect(
      peelFirstChunk(streamOf([{ type: "start" }, { type: "error", error: "429 rate limit" }]))
    ).rejects.toThrow(/429 rate limit/);
  });

  it("整条流只有 start：按空流处理", async () => {
    const { stream } = await peelFirstChunk(streamOf([{ type: "start" }]));
    expect(await drain(stream)).toEqual([]);
  });

  it("空流：按空流处理", async () => {
    const { stream } = await peelFirstChunk(streamOf([]));
    expect(await drain(stream)).toEqual([]);
  });

  it("剥取之后的报错：从返回的流里冒出来，不被吞掉", async () => {
    let sent = 0;
    const stream = new ReadableStream<Part>({
      pull(controller) {
        sent += 1;
        if (sent === 1) controller.enqueue({ type: "start" });
        else if (sent === 2) controller.enqueue({ type: "start-step" });
        else controller.error(new Error("stream died mid-flight"));
      },
    });

    const { stream: out } = await peelFirstChunk(stream);
    await expect(drain(out)).rejects.toThrow(/mid-flight/);
  });
});

describe("peelFirstChunk × 真实 streamText（实证 SDK 行为）", () => {
  const failing = () =>
    new MockLanguageModelV3({
      provider: "test",
      modelId: "quota-exhausted",
      doStream: async () => {
        throw QUOTA;
      },
    });

  it("模型调用失败时 SDK 吐 error part，而不是 reject", async () => {
    // 这条是给 SDK 行为立的桩。哪天它改成 reject，说明 ② 不成立了，
    // 下面的探测逻辑要跟着改。
    const result = streamText({ model: failing(), prompt: "hi", maxRetries: 0 });
    const parts: Part[] = await drain(result.stream as unknown as ReadableStream<Part>);

    expect(parts.map((p) => p.type)).toEqual(["start", "error"]);
  });

  it("因此 peelFirstChunk 会抛出——降级真的会被触发", async () => {
    const result = streamText({ model: failing(), prompt: "hi", maxRetries: 0 });
    await expect(peelFirstChunk(result.stream)).rejects.toThrow(/AllocationQuota/);
  });

  it("正常模型：剥取成功且后续文本完整可读", async () => {
    const model = new MockLanguageModelV3({
      provider: "test",
      modelId: "ok",
      doStream: (async () => ({
        stream: streamOf([{ type: "text-delta", id: "t1", delta: "你好" }]),
      })) as MockDoStream,
    });

    const result = streamText({ model, prompt: "hi", maxRetries: 0 });
    const { stream } = await peelFirstChunk(result.stream);
    const parts = await drain(stream as unknown as ReadableStream<Part>);
    const types = parts.map((p) => p.type);

    expect(types).toContain("text-delta");
    expect(types).toContain("finish");
    // start 与 start-step 都被剥过又重放，一个不少
    expect(types.slice(0, 2)).toEqual(["start", "start-step"]);
  });
});
