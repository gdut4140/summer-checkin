import { describe, expect, it } from "vitest";
import { readableAIError } from "@/lib/ai-error";

// 真实故障：/api/ai 返回 {"error":"AI 服务暂时不可用，请稍后重试"}，
// AI SDK 把整个 body 放进 error.message，界面 toast 直接显示了 JSON。
// 这里锁住「展示给用户的必须只有里面的内容」。

describe("readableAIError", () => {
  it("纯 JSON 的 error 字段 → 只返回内容", () => {
    const error = new Error('{"error":"AI 服务暂时不可用，请稍后重试"}');
    expect(readableAIError(error)).toBe("AI 服务暂时不可用，请稍后重试");
  });

  it("JSON 的 message 字段 → 返回 message", () => {
    const error = new Error('{"message":"模型额度不足"}');
    expect(readableAIError(error)).toBe("模型额度不足");
  });

  it("AI SDK 包装文本里夹着 JSON → 提取 error", () => {
    const error = new Error('AI_APICallError: {"error":"模型不存在"}');
    expect(readableAIError(error)).toBe("模型不存在");
  });

  it("普通字符串原样返回", () => {
    expect(readableAIError(new Error("网络错误"))).toBe("网络错误");
  });

  it("空错误 → fallback", () => {
    expect(readableAIError(new Error("   "))).toBe("AI 回复失败");
    expect(readableAIError(undefined)).toBe("AI 回复失败");
  });
});
