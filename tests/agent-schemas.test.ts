import { describe, expect, it } from "vitest";
import {
  planDraftSchema,
  planTaskDraftSchema,
  analysisFindingSchema,
  agentAnalysisSchema,
} from "@/lib/agent/types";

// 这些 schema 是 LLM 结构化输出的唯一闸门：模型返回的 JSON 直接进 parse，
// 越界值靠它们拦住，所以边界必须锁住。

describe("planTaskDraftSchema", () => {
  it("最小合法输入：只给 title，其余取默认值", () => {
    const r = planTaskDraftSchema.parse({ title: "背单词" });
    expect(r.category).toBe("study");
    expect(r.priority).toBe("normal");
    expect(r.dayNumber).toBeUndefined();
  });

  it("title 为空被拒", () => {
    expect(planTaskDraftSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("title 超过 160 字被拒", () => {
    expect(planTaskDraftSchema.safeParse({ title: "x".repeat(160) }).success).toBe(true);
    expect(planTaskDraftSchema.safeParse({ title: "x".repeat(161) }).success).toBe(false);
  });

  it("dayNumber 必须是 1..365 的整数（防模型编出第 400 天）", () => {
    expect(planTaskDraftSchema.safeParse({ title: "t", dayNumber: 1 }).success).toBe(true);
    expect(planTaskDraftSchema.safeParse({ title: "t", dayNumber: 365 }).success).toBe(true);
    expect(planTaskDraftSchema.safeParse({ title: "t", dayNumber: 0 }).success).toBe(false);
    expect(planTaskDraftSchema.safeParse({ title: "t", dayNumber: 366 }).success).toBe(false);
    expect(planTaskDraftSchema.safeParse({ title: "t", dayNumber: 1.5 }).success).toBe(false);
  });

  it("weekNumber 上限 52", () => {
    expect(planTaskDraftSchema.safeParse({ title: "t", weekNumber: 52 }).success).toBe(true);
    expect(planTaskDraftSchema.safeParse({ title: "t", weekNumber: 53 }).success).toBe(false);
  });

  it("category / priority 只接受枚举值", () => {
    expect(planTaskDraftSchema.safeParse({ title: "t", category: "study" }).success).toBe(true);
    expect(planTaskDraftSchema.safeParse({ title: "t", category: "随便编的" }).success).toBe(false);
    expect(planTaskDraftSchema.safeParse({ title: "t", priority: "urgent" }).success).toBe(false);
  });
});

describe("planDraftSchema", () => {
  const valid = { name: "暑假计划", goal: "学完 React" };

  it("最小合法输入，tasks / assumptions 默认空数组", () => {
    const r = planDraftSchema.parse(valid);
    expect(r.tasks).toEqual([]);
    expect(r.assumptions).toEqual([]);
  });

  it("goal 必填", () => {
    expect(planDraftSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(planDraftSchema.safeParse({ ...valid, goal: "" }).success).toBe(false);
  });

  it("name 上限 120 字", () => {
    expect(planDraftSchema.safeParse({ ...valid, name: "x".repeat(120) }).success).toBe(true);
    expect(planDraftSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
  });

  it("tasks 上限 40（防一次生成过多任务）", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}` }));
    expect(planDraftSchema.safeParse({ ...valid, tasks: make(40) }).success).toBe(true);
    expect(planDraftSchema.safeParse({ ...valid, tasks: make(41) }).success).toBe(false);
  });

  it("assumptions 上限 8", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `a${i}`);
    expect(planDraftSchema.safeParse({ ...valid, assumptions: make(8) }).success).toBe(true);
    expect(planDraftSchema.safeParse({ ...valid, assumptions: make(9) }).success).toBe(false);
  });

  it("嵌套 task 非法时整体失败，不会漏进一条空任务", () => {
    expect(planDraftSchema.safeParse({ ...valid, tasks: [{ title: "" }] }).success).toBe(false);
  });
});

// analyze 的闸门。加这层之前它只做 JSON.parse 不校验，
// 于是 {"foo":1} 会被读成 status=on_track + 空 findings，即「一切正常」——
// 失败伪装成成功。这组用例锁住的是「结构不对必须被拒」。
describe("agentAnalysisSchema", () => {
  const valid = { status: "on_track", summary: "今天不错，继续保持" };

  it("最小合法输入，findings / actions 默认空数组", () => {
    const r = agentAnalysisSchema.parse(valid);
    expect(r.findings).toEqual([]);
    expect(r.actions).toEqual([]);
  });

  it("⚠️ 空 findings + 空 actions 必须通过（用户确实一切正常是合法结果）", () => {
    // 别照搬 planDraftSchema「tasks 为空即无效」那个守卫：
    // 没任务的计划没用，但没发现问题的分析恰恰是正常的。
    const r = agentAnalysisSchema.safeParse({ ...valid, findings: [], actions: [] });
    expect(r.success).toBe(true);
  });

  it("整份结构不对（模型返回了别的 JSON）必须被拒", () => {
    expect(agentAnalysisSchema.safeParse({ foo: 1 }).success).toBe(false);
    expect(agentAnalysisSchema.safeParse({}).success).toBe(false);
    expect(agentAnalysisSchema.safeParse(null).success).toBe(false);
  });

  it("status 只接受 prompt 里那四个值", () => {
    for (const s of ["on_track", "need_attention", "need_adjustment", "at_risk"]) {
      expect(agentAnalysisSchema.safeParse({ ...valid, status: s }).success).toBe(true);
    }
    expect(agentAnalysisSchema.safeParse({ ...valid, status: "all_good" }).success).toBe(false);
  });

  it("summary 必填且不能为空", () => {
    expect(agentAnalysisSchema.safeParse({ status: "on_track" }).success).toBe(false);
    expect(agentAnalysisSchema.safeParse({ ...valid, summary: "" }).success).toBe(false);
  });

  it("findings 的 category / severity 只接受枚举值", () => {
    const finding = { category: "progress", severity: "info", detail: "你今天没打卡" };
    expect(agentAnalysisSchema.safeParse({ ...valid, findings: [finding] }).success).toBe(true);
    expect(
      agentAnalysisSchema.safeParse({ ...valid, findings: [{ ...finding, category: "乱编" }] }).success
    ).toBe(false);
    expect(
      agentAnalysisSchema.safeParse({ ...valid, findings: [{ ...finding, severity: "urgent" }] }).success
    ).toBe(false);
  });

  it("actions 的 type / priority 只接受枚举值", () => {
    const action = {
      type: "SEND_REMINDER",
      priority: "high",
      reason: "连续三天没打卡",
      detail: "今天花 20 分钟做一道题就行",
    };
    expect(agentAnalysisSchema.safeParse({ ...valid, actions: [action] }).success).toBe(true);
    expect(
      agentAnalysisSchema.safeParse({ ...valid, actions: [{ ...action, type: "DELETE_ALL" }] }).success
    ).toBe(false);
    expect(
      agentAnalysisSchema.safeParse({ ...valid, actions: [{ ...action, priority: "urgent" }] }).success
    ).toBe(false);
  });

  it("evidence 是元数据，缺失或给成乱七八糟的值都不该让整份分析作废", () => {
    const finding = { category: "streak", severity: "info", detail: "断了一天" };
    expect(analysisFindingSchema.parse(finding).evidence).toEqual({});

    const asString = analysisFindingSchema.safeParse({ ...finding, evidence: "3天" });
    expect(asString.success).toBe(true);
    if (asString.success) expect(asString.data.evidence).toEqual({});

    const asNull = analysisFindingSchema.safeParse({ ...finding, evidence: null });
    expect(asNull.success).toBe(true);
    if (asNull.success) expect(asNull.data.evidence).toEqual({});
  });

  it("findings / actions 有上界，拦住畸形大 payload", () => {
    const finding = { category: "progress", severity: "info", detail: "x" };
    const action = { type: "ENCOURAGE", priority: "low", reason: "r", detail: "d" };
    const nFindings = (n: number) => Array.from({ length: n }, () => finding);
    const nActions = (n: number) => Array.from({ length: n }, () => action);

    expect(agentAnalysisSchema.safeParse({ ...valid, findings: nFindings(20) }).success).toBe(true);
    expect(agentAnalysisSchema.safeParse({ ...valid, findings: nFindings(21) }).success).toBe(false);
    expect(agentAnalysisSchema.safeParse({ ...valid, actions: nActions(10) }).success).toBe(true);
    expect(agentAnalysisSchema.safeParse({ ...valid, actions: nActions(11) }).success).toBe(false);
  });
});
