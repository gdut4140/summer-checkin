import { describe, expect, it } from "vitest";
import { planDraftSchema, planTaskDraftSchema } from "@/lib/agent/types";

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
