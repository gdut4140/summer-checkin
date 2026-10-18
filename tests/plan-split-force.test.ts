import { beforeEach, describe, expect, it, vi } from "vitest";

// splitPlanTasks 的 force 参数是「用户能不能覆盖 AI 判断」这件事的全部实现。
//
// 背景：重拆前会先让 AI 判断「文档改动是否实质影响任务」，大意没变就不拆。
// 但那是模型猜的，而且 prompt 刻意让它「倾向说不改」——实测 3 个真实计划全部返回
// needsUpdate=false。用户认为改了、模型说没改时，抽屉上就什么都发生不了，只能手工
// 改任务。所以手动点「刷新任务」这条路直接 force，跳过判断。
//
// 这里钉住两条：force 时**不查**判断用的任务清单；不 force 时判断照旧生效。

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findUnique: vi.fn(), update: vi.fn() },
    planTask: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/model-pool", () => ({ completionsWithFallback: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { splitPlanTasks } from "@/lib/plan-split";
import { prisma } from "@/lib/prisma";
import { completionsWithFallback } from "@/lib/model-pool";

const mockPlanFind = vi.mocked(prisma.plan.findUnique);
const mockPlanUpdate = vi.mocked(prisma.plan.update);
const mockTaskFind = vi.mocked(prisma.planTask.findMany);
const mockTaskCreate = vi.mocked(prisma.planTask.create);
const mockComplete = vi.mocked(completionsWithFallback);

const PLAN_ID = "p1";
const USER_ID = "u1";

/** 判断阶段：模型回答「是否需要更新」 */
function judgeReply(needsUpdate: boolean) {
  return {
    data: {
      choices: [
        { message: { content: JSON.stringify({ needsUpdate, reason: "测试" }) } },
      ],
    },
    model: "test",
  } as never;
}

/** 拆分阶段：模型返回任务清单 */
function splitReply(titles: string[]) {
  return {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({ tasks: titles.map((t) => ({ title: t })) }),
          },
        },
      ],
    },
    model: "test",
  } as never;
}

/** 判断阶段特有的查询：只要 title，不带别的字段 */
const isJudgeQuery = (arg: unknown) =>
  JSON.stringify(arg).includes('"title":true');

describe("splitPlanTasks 的 force", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanFind.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      document: "文档正文",
      goal: "目标",
      description: null,
      tasksSourceHash: null,
      tasksSplittingAt: null,
    } as never);
    mockPlanUpdate.mockResolvedValue({} as never);
    mockTaskFind.mockResolvedValue([] as never);
    mockTaskCreate.mockResolvedValue({} as never);
  });

  it("force=true：跳过 AI 判断，直接拆（不查判断用的任务清单）", async () => {
    mockComplete.mockResolvedValue(splitReply(["任务A", "任务B"]));

    const r = await splitPlanTasks(PLAN_ID, USER_ID, { force: true });

    expect(r.changed).toBe(true);
    expect(r.created).toBe(2);
    // 判断阶段那次「只要 title」的查询不该发生
    const judgeCalls = mockTaskFind.mock.calls.filter((c) => isJudgeQuery(c[0]));
    expect(judgeCalls, "force 时不该跑判断阶段的查询").toHaveLength(0);
    // 只调用了一次模型（拆分的），没有判断那一次
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("force=false 且 AI 说无需更新：不拆，只更新哈希", async () => {
    mockComplete.mockResolvedValue(judgeReply(false));

    const r = await splitPlanTasks(PLAN_ID, USER_ID);

    expect(r.changed).toBe(false);
    expect(r.reason).toBe("no-change");
    expect(mockTaskCreate).not.toHaveBeenCalled();
    // 判断阶段确实跑了
    expect(mockTaskFind.mock.calls.filter((c) => isJudgeQuery(c[0]))).toHaveLength(1);
  });

  it("force=false 且 AI 说要更新：判断放行后照常拆分（对照组）", async () => {
    mockComplete
      .mockResolvedValueOnce(judgeReply(true))
      .mockResolvedValueOnce(splitReply(["任务A"]));

    const r = await splitPlanTasks(PLAN_ID, USER_ID);

    expect(r.changed).toBe(true);
    expect(r.created).toBe(1);
    expect(mockComplete).toHaveBeenCalledTimes(2); // 判断 + 拆分
  });
});
