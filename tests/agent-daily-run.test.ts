import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/agent/daily-run 的几条要紧路径：
// ① 未登录必须 401，且不能跑分析（这是原来 cron 端点 fail-open 的教训）
// ② 同一用户当天第二次请求必须直接跳过，不重复花 LLM、不重复清理
// ③ 幂等靠唯一约束抢锁（create 撞 P2002），不是先 findFirst 再 create——
//    多标签页同时打开是常态，先查后写挡不住
// ④ 分析已经跑起来之后再抛错，锁行要保留（不反复打模型）
// ⑤ 抢到锁但还没开跑就抛错（如周报挂了），锁行要还回去让下次能重试

vi.mock("@/lib/auth-utils", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { agentRun: { create: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("@/lib/agent", () => ({
  runLearningAgent: vi.fn(),
  agentRunGoal: vi.fn(() => "测试分析目标"),
}));
vi.mock("@/lib/agent/weekly", () => ({
  createWeeklyReportNotification: vi.fn(),
}));
vi.mock("@/lib/notification", () => ({ cleanupOldNotifications: vi.fn() }));
vi.mock("@/lib/memory", () => ({ cleanupColdMemories: vi.fn() }));

import { POST } from "@/app/api/agent/daily-run/route";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { runLearningAgent } from "@/lib/agent";
import { createWeeklyReportNotification } from "@/lib/agent/weekly";
import { cleanupOldNotifications } from "@/lib/notification";
import { cleanupColdMemories } from "@/lib/memory";

const mockAuth = vi.mocked(getAuthUser);
const mockCreate = vi.mocked(prisma.agentRun.create);
const mockDeleteMany = vi.mocked(prisma.agentRun.deleteMany);
const mockRun = vi.mocked(runLearningAgent);
const mockWeekly = vi.mocked(createWeeklyReportNotification);
const mockCleanupNotifs = vi.mocked(cleanupOldNotifications);
const mockCleanupMemories = vi.mocked(cleanupColdMemories);

/** Prisma 唯一约束冲突的形状（见 route 里的 isUniqueViolation，按 code 判定） */
function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

describe("POST /api/agent/daily-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ id: "u1" } as never);
    mockCreate.mockResolvedValue({ id: "run1" } as never); // 抢锁成功
    mockDeleteMany.mockResolvedValue({ count: 0 } as never);
    mockWeekly.mockResolvedValue(null);
    mockRun.mockResolvedValue({
      status: "on_track",
      executedActions: [],
    } as never);
    mockCleanupNotifs.mockResolvedValue(0);
    mockCleanupMemories.mockResolvedValue({
      deleted: 0,
      kept: 0,
      examined: 0,
    });
  });

  it("未登录 → 401，且完全不抢锁、不跑分析", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("抢锁撞唯一约束（别人已在跑）→ 跳过；不重复跑分析、不重复清理", async () => {
    mockCreate.mockRejectedValue(uniqueViolation());
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, skipped: true });
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockCleanupNotifs).not.toHaveBeenCalled();
  });

  it("抢锁失败但不是唯一冲突（如库挂了）→ 500，不当成「今天已跑过」", async () => {
    mockCreate.mockRejectedValue(new Error("connection refused"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("抢锁成功 → 复用锁行跑分析（带 runId），并按 7 天保留期清理通知", async () => {
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(false);

    // 锁行必须带 runDate（YYYY-MM-DD），唯一约束靠它生效
    const claimArgs = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(claimArgs.data.userId).toBe("u1");
    expect(claimArgs.data.runDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(claimArgs.data.status).toBe("queued");

    // 分析复用抢到的锁行，不再新建一行
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ persist: true, runId: "run1" })
    );
    expect(mockCleanupNotifs).toHaveBeenCalledWith("u1", 7);
  });

  it("分析抛异常 → 不影响清理，也不返回 500，且保留锁行（不反复打模型）", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockCleanupNotifs).toHaveBeenCalledWith("u1", 7);
    expect(mockCleanupMemories).toHaveBeenCalledWith("u1");
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("抢到锁但分析还没开跑就抛错（如周报挂了）→ 释放锁行，让下次能重试", async () => {
    // 周报只在周日跑，所以要把日期钉到周日才走得到这条路径（2026-10-11 是周日）
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00"));
    try {
      mockWeekly.mockRejectedValue(new Error("weekly boom"));
      const res = await POST();

      expect(res.status).toBe(500);
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockWeekly).toHaveBeenCalledTimes(1);
      // 周日的锁行应为 review 模式 + 当天日期
      const claimArgs = mockCreate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(claimArgs.data.mode).toBe("review");
      expect(claimArgs.data.runDate).toBe("2026-10-11");
      // 只删仍是 queued 的那行——原子条件删除，不是第二次 check-then-act
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: "run1", status: "queued" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
