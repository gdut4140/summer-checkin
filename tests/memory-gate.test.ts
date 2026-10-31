import { describe, expect, it } from "vitest";
import { evaluateExtractionGate } from "@/lib/memory/gate";

describe("evaluateExtractionGate", () => {
  const gate = (userMessage: string, turns = 0) =>
    evaluateExtractionGate({
      userMessage,
      assistantTurnsSinceLastExtraction: turns,
    });

  it("自我披露（我 + 使用）→ 抽取", () => {
    expect(gate("我现在主要使用 React。")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
  });

  it("修正旧信息 → 抽取，且优先级高于普通披露", () => {
    expect(gate("我之前主要用 Vue，现在转 React 了")).toEqual({
      shouldExtract: true,
      reason: "correction",
    });
  });

  it("明确的记忆指令 → 抽取", () => {
    expect(gate("记住：我用 Windows")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
  });

  it("偏好陈述 → 抽取", () => {
    expect(gate("我喜欢先看原理，再看代码")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
  });

  it("省略主语的生活偏好 → 也要抽取（“喜欢吃奥利奥”）", () => {
    expect(gate("喜欢吃奥利奥")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
    expect(gate("爱吃奥利奥")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
    expect(gate("我享受披萨")).toEqual({
      shouldExtract: true,
      reason: "explicit_signal",
    });
  });

  it("“我喜欢吃什么”是提问 → 不抽取", () => {
    expect(gate("我喜欢吃什么")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });

  it("提问句即使带披露谓词 → 不抽取", () => {
    expect(gate("怎么学习 React？")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
    expect(gate("我该怎么准备面试？")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });

  it("请求句 → 不抽取", () => {
    expect(gate("帮我用 React 写个组件")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
    expect(gate("推荐一下学习路线")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });

  it("纯提问且未到轮次 → 不抽取", () => {
    expect(gate("帮我查一下 React 文档")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });

  it("寒暄且未到轮次 → 不抽取", () => {
    expect(gate("今天天气不错")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });

  it("每 3 轮兜底：已经过了 2 条助手消息 → 抽取", () => {
    expect(gate("今天天气不错", 2)).toEqual({
      shouldExtract: true,
      reason: "every_three_turns",
    });
  });

  it("过短消息（非记忆指令）→ 跳过", () => {
    expect(gate("谢谢")).toEqual({
      shouldExtract: false,
      reason: "too_short",
    });
  });

  it("完成任务的陈述不误判为个人信息", () => {
    expect(gate("我今天完成了三个任务")).toEqual({
      shouldExtract: false,
      reason: "not_eligible",
    });
  });
});
