import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// /api/ai 是三个界面共用的唯一 AI 端点，现在**同时**说两种协议：
//   protocol:"ui"  → AI SDK 的 UI message 流（智能体页，工具调用要抵达浏览器）
//   protocol 缺省  → 纯文本流（studio 面板，尚未迁移）
//
// 这条测试钉的是「两种协议都不要互相踩」：
// ① UI 协议必须真的把工具调用编进 SSE——这是整个迁移的目的，也是旧实现丢掉的东西
// ② UI 协议的助手消息必须带 parts 落库，content 仍写纯文本（标题/提示词按字符串读它）
// ③ 文本协议（studio 走的那条）行为**一字不变**：content 拼接所有步、parts 不写
// ④ 两种协议请求体形状不同，服务端要能各认各的

vi.mock("@/lib/auth-utils", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { create: vi.fn(), update: vi.fn() },
    conversationMessage: { create: vi.fn() },
    plan: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage")>();
  return { ...actual, assertInteractiveUsageAllowed: vi.fn(), recordUsage: vi.fn() };
});
vi.mock("@/lib/model-pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/model-pool")>();
  return { ...actual, streamTextWithFallback: vi.fn() };
});
vi.mock("@/lib/deepseek", () => ({
  generateChatTitle: vi.fn(async () => "测试标题"),
  buildSystemPrompt: () => "系统提示词",
  getDeepThinkOptions: () => undefined,
}));
vi.mock("@/lib/memory", () => ({
  getRelevantMemories: vi.fn(async () => []),
  formatMemoriesForPrompt: vi.fn(() => ""),
  extractAndSaveMemories: vi.fn(async () => {}),
  touchMemories: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/ai/route";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { streamTextWithFallback } from "@/lib/model-pool";

const mockAuth = vi.mocked(getAuthUser);
const mockMessageCreate = vi.mocked(prisma.conversationMessage.create);
const mockStreamText = vi.mocked(streamTextWithFallback);

type Part = { type: string; [k: string]: unknown };

function streamOf(parts: Part[]): ReadableStream<Part> {
  let i = 0;
  return new ReadableStream<Part>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(parts[i++]);
      else controller.close();
    },
  });
}

/**
 * 一轮「先调工具再回答」的 part 流，形状对齐 ai@7 的 TextStreamPart
 * （注意 text-delta 用 `text`，而 UI chunk 里叫 `delta`）。
 */
const TOOL_CALL_PARTS: Part[] = [
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", text: "我先看一下你的任务。" },
  { type: "text-end", id: "t1" },
  { type: "tool-input-start", id: "call1", toolName: "getTodayTasks" },
  { type: "tool-input-end", id: "call1" },
  { type: "tool-call", toolCallId: "call1", toolName: "getTodayTasks", input: {} },
  {
    type: "tool-result",
    toolCallId: "call1",
    toolName: "getTodayTasks",
    input: {},
    output: { tasks: 3 },
  },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t2" },
  { type: "text-delta", id: "t2", text: "今天有 3 个任务。" },
  { type: "text-end", id: "t2" },
  { type: "finish-step" },
  { type: "finish" },
];

/** 纯文本一轮，用于验证文本协议分支 */
const TEXT_ONLY_PARTS: Part[] = [
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", text: "第一段" },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t2" },
  { type: "text-delta", id: "t2", text: "第二段" },
  { type: "text-end", id: "t2" },
  { type: "finish-step" },
  { type: "finish" },
];

function post(body: unknown) {
  return new NextRequest("http://localhost/api/ai", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** 落库的那次 create 调用（跳过用户消息那条） */
function assistantCreateCall() {
  return mockMessageCreate.mock.calls
    .map(([arg]) => arg as { data: Record<string, unknown> })
    .find((arg) => arg.data.role === "assistant");
}

/**
 * 桩掉模型池。
 *
 * ⚠️ 必须**手动补上 streamText 的 onEnd 回调**：真实 streamText 只在整条流跑完后
 * 才回调它，而文本协议（studio）的落库正挂在那里。直接返回一个流的话，那条路径
 * 在测试里永远不会被走到——看着是绿的，其实没验到。
 */
function stubStream(parts: Part[], stepTexts: string[]) {
  mockStreamText.mockImplementation((async (
    _tier: unknown,
    build: (entry: unknown, model: unknown) => { onEnd?: (event: unknown) => void }
  ) => {
    const options = build({}, {});
    options.onEnd?.({
      // 真实 SDK 的 text 只是最后一步的文本，steps 才是全部——route 里靠 steps 拼接
      text: stepTexts.at(-1) ?? "",
      steps: stepTexts.map((text) => ({ text })),
      finalStep: { finishReason: "stop" },
    });
    return { stream: streamOf(parts), model: "test-model" };
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ id: "u1", name: null } as never);
  mockMessageCreate.mockResolvedValue({} as never);
  vi.mocked(prisma.conversation.update).mockResolvedValue({} as never);
  stubStream(TOOL_CALL_PARTS, ["我先看一下你的任务。", "今天有 3 个任务。"]);
});

describe("POST /api/ai — UI 协议", () => {
  it("工具调用被编进 SSE（迁移的全部意义所在）", async () => {
    const response = await POST(
      post({
        protocol: "ui",
        conversationId: "c1",
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "我今天有什么任务" }] },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const body = await response.text();
    // 工具名与调用 id 必须真的出现在线上
    expect(body).toContain("getTodayTasks");
    expect(body).toContain("call1");
    expect(body).toContain("tool-input-available");
    expect(body).toContain("tool-output-available");
    // 文本也在
    expect(body).toContain("今天有 3 个任务。");
  });

  it("助手消息带 parts 落库，content 仍写纯文本", async () => {
    const response = await POST(
      post({
        protocol: "ui",
        conversationId: "c1",
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "我今天有什么任务" }] },
        ],
      })
    );
    // ⚠️ 必须先消费响应体：onEnd 只在流跑完时回调，不读流它就永远不会落库
    // （文本协议同理——这也是为什么两边的落库都挂在流完成的回调上）
    await response.text();
    await vi.waitFor(() => expect(assistantCreateCall()).toBeDefined());

    const data = assistantCreateCall()!.data;
    // content 是标题生成与 conversationHint 的读取契约，必须是拼接后的纯文本
    expect(data.content).toBe("我先看一下你的任务。今天有 3 个任务。");
    // parts 是结构化片段：工具被压成摘要，不带 input/output 原文
    const parts = data.parts as Array<Record<string, unknown>>;
    // 顺序与 part 流一致：先说的话、工具调用、再是基于工具结果的回答
    expect(parts).toEqual([
      { type: "text", text: "我先看一下你的任务。" },
      { type: "tool", toolName: "getTodayTasks", toolCallId: "call1", state: "output-available" },
      { type: "text", text: "今天有 3 个任务。" },
    ]);
  });

  it("会话 id 通过响应头回传（客户端靠它续上同一段对话）", async () => {
    const response = await POST(
      post({
        protocol: "ui",
        conversationId: "c1",
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "在吗" }] },
        ],
      })
    );
    expect(response.headers.get("X-Conversation-Id")).toBe("c1");
  });

  it("用户消息按 parts 里的文本落库，而不是整个 JSON", async () => {
    await POST(
      post({
        protocol: "ui",
        conversationId: "c1",
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "我今天有什么任务" }] },
        ],
      })
    );
    const userCall = mockMessageCreate.mock.calls
      .map(([arg]) => arg as { data: Record<string, unknown> })
      .find((arg) => arg.data.role === "user");
    expect(userCall!.data.content).toBe("我今天有什么任务");
  });
});

describe("POST /api/ai — 文本协议（studio 面板，未迁移）", () => {
  beforeEach(() => {
    stubStream(TEXT_ONLY_PARTS, ["第一段", "第二段"]);
  });

  it("仍是 text/plain，且拼接所有步的文本", async () => {
    const response = await POST(
      post({
        conversationId: "c1",
        messages: [
          { role: "user", content: "在吗" },
          { role: "assistant", content: "在的" },
          { role: "user", content: "继续" },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("第一段第二段");
  });

  it("助手消息不写 parts（这一列对它没有意义）", async () => {
    const response = await POST(
      post({
        conversationId: "c1",
        messages: [{ role: "user", content: "在吗" }],
      })
    );
    await response.text(); // 同上：不消费流就不会触发 onEnd
    await vi.waitFor(() => expect(assistantCreateCall()).toBeDefined());

    const data = assistantCreateCall()!.data;
    expect(data.content).toBe("第一段第二段");
    // undefined = 不写这一列，保持 NULL
    expect(data.parts).toBeUndefined();
  });

  it("旧的 { role, content } 消息形状仍被接受", async () => {
    const response = await POST(
      post({
        conversationId: "c1",
        messages: [{ role: "user", content: "你好" }],
      })
    );
    expect(response.status).toBe(200);
  });

  it("空消息数组仍然 400", async () => {
    const response = await POST(post({ conversationId: "c1", messages: [] }));
    expect(response.status).toBe(400);
  });
});
