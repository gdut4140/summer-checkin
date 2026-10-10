import { beforeEach, describe, expect, it, vi } from "vitest";

// analyze 的回归测试。
//
// 修复前的行为：只做 JSON.parse 就取字段——
//   const parsed = JSON.parse(text);
//   return { status: parsed.status ?? "on_track", findings: [...], actions: [...] };
// 于是任何「能解析但结构不对」的输出都会变成 status=on_track + 空 findings，
// 也就是「一切正常」。这不是崩溃，是**失败伪装成成功**，所以下面那条
// 「结构错误的合法 JSON → 必须走规则兜底」就是本次修复的核心断言。

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/model-pool", () => ({ completionsWithFallback: vi.fn() }));
vi.mock("@/lib/memory", () => ({
  getRelevantMemories: vi.fn(),
  touchMemories: vi.fn(),
}));

import {
  analyze,
  fallbackAnalysis,
  type LearningContext,
} from "@/lib/agent/runtime";
import { completionsWithFallback } from "@/lib/model-pool";

const mockComplete = vi.mocked(completionsWithFallback);

/** 造一个 completionsWithFallback 的返回（它返回 { data, model }） */
function reply(content: string) {
  return {
    data: { choices: [{ message: { content }, finish_reason: "stop" }] },
    model: "test-model",
  } as never;
}

/** 空上下文的用户：没有任何计划和打卡 */
const emptyContext: LearningContext = {
  userId: "u1",
  collectedAt: new Date("2026-10-09T00:00:00Z").toISOString(),
  profile: { goalMemories: [], activePlanCount: 0, activePlanNames: [] },
  stats: { streak: 0, totalCheckins: 0 },
  focus: { todayMinutes: 0, todaySessions: 0 },
  plans: [],
  pendingTasks: [],
  recentCheckins: [],
};

const VALID_JSON = JSON.stringify({
  status: "need_attention",
  summary: "这两天有点松，找回节奏",
  findings: [
    { category: "streak", severity: "warning", detail: "你连续两天没打卡了" },
  ],
  actions: [
    {
      type: "SEND_REMINDER",
      priority: "high",
      reason: "连续两天没打卡",
      detail: "今天花 20 分钟做一道题就行",
    },
  ],
});

describe("analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("合法 JSON → source=model，字段原样透传", async () => {
    mockComplete.mockResolvedValue(reply(VALID_JSON));
    const r = await analyze(emptyContext, [], "u1");

    expect(r.source).toBe("model");
    expect(r.reason).toBeUndefined();
    expect(r.analysis.status).toBe("need_attention");
    expect(r.analysis.findings).toHaveLength(1);
    expect(r.analysis.actions[0].type).toBe("SEND_REMINDER");
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("模型把 JSON 包在 markdown 围栏里 → 仍能解析", async () => {
    mockComplete.mockResolvedValue(reply("```json\n" + VALID_JSON + "\n```"));
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("model");
    expect(r.analysis.status).toBe("need_attention");
  });

  it("⚠️ 结构错误的合法 JSON（{\"foo\":1}）→ 走规则兜底，不再装成「一切正常」", async () => {
    mockComplete.mockResolvedValue(reply('{"foo":1}'));
    const r = await analyze(emptyContext, [], "u1");

    expect(r.source).toBe("fallback");
    expect(r.reason).toBe("schema_invalid");
    // 修复前这里会是 status=on_track + 空 findings；现在必须是规则兜底的结果
    expect(r.analysis).toEqual(fallbackAnalysis(emptyContext));
    expect(r.analysis.status).not.toBe("on_track");
  });

  it("枚举越界（status 编了个新值）→ 走规则兜底", async () => {
    mockComplete.mockResolvedValue(
      reply(JSON.stringify({ status: "all_good", summary: "挺好" }))
    );
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("fallback");
    expect(r.reason).toBe("schema_invalid");
  });

  it("非法 JSON → 重试一次，两次都坏才兜底", async () => {
    mockComplete.mockResolvedValue(reply("{这不是 JSON"));
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("fallback");
    expect(r.reason).toBe("json_parse");
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it("第一次坏、第二次好 → source=model（重试有效）", async () => {
    mockComplete
      .mockResolvedValueOnce(reply('{"foo":1}'))
      .mockResolvedValueOnce(reply(VALID_JSON));
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("model");
    expect(r.analysis.status).toBe("need_attention");
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it("模型返回空内容 → 兜底，reason=empty_text", async () => {
    mockComplete.mockResolvedValue(reply("   "));
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("fallback");
    expect(r.reason).toBe("empty_text");
  });

  it("LLM 调用直接抛错 → 兜底，reason=llm_error", async () => {
    mockComplete.mockRejectedValue(new Error("额度用尽"));
    const r = await analyze(emptyContext, [], "u1");
    expect(r.source).toBe("fallback");
    expect(r.reason).toBe("llm_error");
    expect(r.analysis).toEqual(fallbackAnalysis(emptyContext));
  });
});
