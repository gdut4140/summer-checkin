import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/plans/[id]/tasks 的两个派生字段直接决定抽屉的行为：
//   splitting=true → 显示「任务刷新中」并每 2 秒轮询
//   stale=true     → 显示「计划已修改，任务可能不是最新的」横幅
//
// splitting 的自愈是最要紧的一条：tasksSplittingAt 只在拆分收尾路径里被清掉，
// 那次拆分若中途断掉（请求取消/进程重启/超时），标记会永久留在库里 —— 于是每次
// GET 都返回 true，抽屉永远转圈、永远轮询，刷新页面也不恢复。所以超过阈值必须
// 当作「没在拆分」，否则这个 bug 只能靠改库解决。

vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findUnique: vi.fn() },
    planTask: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/plans/[id]/tasks/route";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { planTaskSourceHash } from "@/lib/plan-tasks";

const mockAuth = vi.mocked(getCurrentUser);
const mockPlan = vi.mocked(prisma.plan.findUnique);
const mockTasks = vi.mocked(prisma.planTask.findMany);

const PLAN_ID = "p1";
const USER_ID = "u1";

function planRow(over: Record<string, unknown> = {}) {
  const base = {
    id: PLAN_ID,
    userId: USER_ID,
    document: "文档正文",
    goal: "目标",
    description: null,
    tasksSourceHash: null as string | null,
    tasksSplittingAt: null as Date | null,
    ...over,
  };
  return base;
}

async function call() {
  const res = await GET({} as Request, {
    params: Promise.resolve({ id: PLAN_ID }),
  });
  return { status: res.status, body: await res.json() };
}

describe("GET /api/plans/[id]/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ id: USER_ID } as never);
    mockTasks.mockResolvedValue([] as never);
  });

  it("未登录 → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("计划不存在或不属于当前用户 → 404", async () => {
    mockPlan.mockResolvedValue(planRow({ userId: "别人" }) as never);
    expect((await call()).status).toBe(404);
    expect(mockTasks).not.toHaveBeenCalled();
  });

  it("刚标记的拆分中（1 分钟前）→ splitting=true", async () => {
    mockPlan.mockResolvedValue(
      planRow({ tasksSplittingAt: new Date(Date.now() - 60_000) }) as never
    );
    const { body } = await call();
    expect(body.splitting).toBe(true);
  });

  it("⚠️ 超过 2 分钟的拆分标记 → splitting=false（崩溃后自愈）", async () => {
    // 一次中断的拆分留下的标记；不清掉的话抽屉会永远转圈 + 每 2 秒轮询
    mockPlan.mockResolvedValue(
      planRow({ tasksSplittingAt: new Date(Date.now() - 10 * 60_000) }) as never
    );
    const { body } = await call();
    expect(body.splitting).toBe(false);
  });

  it("从未拆分过（无 hash）→ 不判 stale（避免误报过期）", async () => {
    mockPlan.mockResolvedValue(planRow({ tasksSourceHash: null }) as never);
    const { body } = await call();
    expect(body.stale).toBe(false);
  });

  it("hash 与当前文档一致 → stale=false", async () => {
    const row = planRow();
    mockPlan.mockResolvedValue(
      planRow({ tasksSourceHash: planTaskSourceHash(row) }) as never
    );
    expect((await call()).body.stale).toBe(false);
  });

  it("文档在拆分后被改过（hash 不符）→ stale=true", async () => {
    mockPlan.mockResolvedValue(
      planRow({ tasksSourceHash: "旧的哈希", document: "改过的正文" }) as never
    );
    expect((await call()).body.stale).toBe(true);
  });
});
