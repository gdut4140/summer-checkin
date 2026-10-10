import { describe, expect, it, vi } from "vitest";

// 工具按场景裁剪是**权限边界**，不是优化：文档工作台里握着 deleteTodo，
// 意味着用户让 AI 改一个错别字，它理论上可以顺手删掉待办——而这些工具全部直接落库、无审批。
//
// 白名单最容易出的错是「漂移」：工具改名/打错字，白名单没跟着改，结果是该给的
// 工具悄悄消失（fail-closed 变成静默失效）。所以有一条专门核对白名单里每个名字
// 都能在候选集里找到。
//
// 同样重要的是提示词：SYSTEM_PROMPT 点名了全部 15 个工具并带祈使指令。只裁工具
// 不裁提示词，模型会反复去调一个不存在的工具——比不裁更糟。

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  AI_SURFACES,
  ALL_PROMPT_GROUPS,
  SURFACE_POLICY,
  pickTools,
  promptGroupsFor,
  surfaceOf,
  toolNamesFor,
} from "@/lib/tools/router";
import { createStudyTools } from "@/lib/tools/study-tools";
import { createRAGTool } from "@/lib/tools/rag-tools";
import { createAgentTools } from "@/lib/tools/agent-tools";
import { createTodoTools } from "@/lib/tools/todo-tools";
import { createStudioTools } from "@/lib/tools/studio-tools";
import { buildSystemPrompt } from "@/lib/deepseek";

/** 与 route.ts 同构地建出全部候选工具 */
function buildCandidates(kind: "plan" | "doc" | null) {
  return {
    ...createStudyTools("u1", {}),
    ...createRAGTool("u1"),
    ...createAgentTools("u1"),
    ...createTodoTools("u1"),
    ...(kind
      ? createStudioTools("u1", { kind, id: kind === "plan" ? "p1" : "d1" })
      : {}),
  };
}

/** 会改「非当前工作台对象」的写工具——工作台一个都不该有 */
const WRITE_TOOLS = [
  "breakdownPlanTasks",
  "updateTaskStatus",
  "createTodo",
  "updateTodo",
  "deleteTodo",
];

/** 只在工作台出现的工具 */
const STUDIO_ONLY_TOOLS = ["updatePlanInfo", "updateDocument"];

/** 读工具：没有爆炸半径，所有场景都该保留 */
const READ_TOOLS = [
  "getMyPlans",
  "getRecentCheckins",
  "getMyMemories",
  "getStudyStats",
  "searchKnowledgeBase",
  "listKnowledgeDocs",
  "getPlanTasks",
  "getTodayTasks",
  "getMyTodos",
];

describe("surfaceOf", () => {
  it("按 studioContext.kind 判定，与建会话时的口径逐字一致", () => {
    expect(surfaceOf(undefined)).toBe("agent");
    expect(surfaceOf(null)).toBe("agent");
    expect(surfaceOf({ kind: "plan" })).toBe("plan");
    expect(surfaceOf({ kind: "doc" })).toBe("doc");
    // 有 context 但 kind 不是 plan → doc（沿用既有口径，不额外收紧）
    expect(surfaceOf({})).toBe("doc");
  });
});

describe("工具白名单", () => {
  it("三个场景都在策略表里有条目", () => {
    expect(Object.keys(SURFACE_POLICY).sort()).toEqual([...AI_SURFACES].sort());
  });

  it("工具数量：智能体 15 / 计划工作台 11 / 文档工作台 10", () => {
    expect(toolNamesFor("agent")).toHaveLength(15);
    expect(toolNamesFor("plan")).toHaveLength(11);
    expect(toolNamesFor("doc")).toHaveLength(10);
  });

  it("⚠️ 工作台一个写工具都不给（这就是做 router 的理由）", () => {
    for (const surface of ["plan", "doc"] as const) {
      const names = toolNamesFor(surface);
      for (const t of WRITE_TOOLS) {
        expect(names, `${surface} 不该持有 ${t}`).not.toContain(t);
      }
      expect(names, `${surface} 不该有 createPlan`).not.toContain("createPlan");
    }
  });

  it("智能体保留全部写工具，但没有 studio 工具（那里没有打开的文档）", () => {
    const names = toolNamesFor("agent");
    expect(names).toContain("createPlan");
    for (const t of WRITE_TOOLS) expect(names, t).toContain(t);
    for (const t of STUDIO_ONLY_TOOLS) expect(names, t).not.toContain(t);
  });

  it("工作台各有自己的写工具，且不越界", () => {
    expect(toolNamesFor("plan")).toContain("updatePlanInfo");
    expect(toolNamesFor("plan")).toContain("updateDocument");
    expect(toolNamesFor("doc")).toContain("updateDocument");
    // 文档没有「计划信息」可改
    expect(toolNamesFor("doc")).not.toContain("updatePlanInfo");
  });

  it("读工具在所有场景都保留（读没有爆炸半径，问答能力零损失）", () => {
    for (const surface of AI_SURFACES) {
      for (const t of READ_TOOLS) {
        expect(toolNamesFor(surface), `${surface} 缺读工具 ${t}`).toContain(t);
      }
    }
  });

  it("⚠️ 白名单里每个名字都能在候选集里找到（防漂移）", () => {
    // 工具改名或白名单打错字时，pickTools 会安静地少给一个工具——
    // 没有这条断言，「fail-closed」就退化成「静默失效」。
    const available = new Set(Object.keys(buildCandidates("plan")));
    for (const surface of AI_SURFACES) {
      for (const name of toolNamesFor(surface)) {
        expect(
          available.has(name),
          `白名单里的 ${name}（${surface}）不在候选集里——工具改名了？`
        ).toBe(true);
      }
    }
  });

  it("pickTools 真的按白名单过滤，不夹带", () => {
    const agent = pickTools(buildCandidates(null), "agent");
    expect(Object.keys(agent).sort()).toEqual([...toolNamesFor("agent")].sort());

    const plan = pickTools(buildCandidates("plan"), "plan");
    expect(Object.keys(plan).sort()).toEqual([...toolNamesFor("plan")].sort());

    const doc = pickTools(buildCandidates("doc"), "doc");
    expect(Object.keys(doc).sort()).toEqual([...toolNamesFor("doc")].sort());
  });
});

describe("系统提示词裁剪", () => {
  it("每个分组都有对应文案（声明了却没文案 → 该场景拿到空提示词）", () => {
    for (const g of ALL_PROMPT_GROUPS) {
      expect(buildSystemPrompt([g]).length, `分组 ${g} 没有文案`).toBeGreaterThan(0);
    }
  });

  it("每个场景都声明了提示词分组", () => {
    for (const surface of AI_SURFACES) {
      expect(promptGroupsFor(surface).length).toBeGreaterThan(0);
    }
  });

  it("⚠️ 工作台提示词不点名任何它没有的工具", () => {
    for (const surface of ["plan", "doc"] as const) {
      const prompt = buildSystemPrompt(promptGroupsFor(surface));
      for (const t of [...WRITE_TOOLS, "createPlan"]) {
        expect(
          prompt.includes(t),
          `${surface} 的提示词点名了不存在的 ${t}——模型会去调它`
        ).toBe(false);
      }
    }
  });

  it("工作台保留知识库「列举 ≠ 检索」的排他说明（踩过真实事故才加的）", () => {
    const prompt = buildSystemPrompt(promptGroupsFor("plan"));
    expect(prompt).toContain("listKnowledgeDocs");
    expect(prompt).toContain("不要用 searchKnowledgeBase");
  });

  it("智能体拿到全部段落，含各写工具的用法", () => {
    const agent = buildSystemPrompt(promptGroupsFor("agent"));
    for (const t of ["createPlan", "breakdownPlanTasks", "updateTaskStatus", "deleteTodo"]) {
      expect(agent, `智能体提示词缺 ${t} 的说明`).toContain(t);
    }
  });

  it("工作台提示词显著短于智能体（裁提示词也是这次的目的之一）", () => {
    const agent = buildSystemPrompt(promptGroupsFor("agent"));
    const plan = buildSystemPrompt(promptGroupsFor("plan"));
    // 实测 4628 → 1472 字符；留足余量，只钉住「确实短了很多」
    expect(plan.length).toBeLessThan(agent.length / 2);
  });
});
