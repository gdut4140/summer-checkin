import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/agent/daily-run 的两条要紧路径：
// ① 未登录必须 401，且不能跑分析（这是原来 cron 端点 fail-open 的教训）
// ② 同一用户当天第二次请求必须直接跳过，不重复花 LLM、不重复清理
// mock 掉全部副作用依赖，断言 runLearningAgent 的调用次数。

vi.mock("@/lib/auth-utils", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { agentRun: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/agent", () => ({ runLearningAgent: vi.fn() }));
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
const mockFindFirst = vi.mocked(prisma.agentRun.findFirst);
const mockRun = vi.mocked(runLearningAgent);
const mockWeekly = vi.mocked(createWeeklyReportNotification);
const mockCleanupNotifs = vi.mocked(cleanupOldNotifications);
const mockCleanupMemories = vi.mocked(cleanupColdMemories);

describe("POST /api/agent/daily-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ id: "u1" } as never);
    mockFindFirst.mockResolvedValue(null); // 今天还没跑过
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

  it("未登录 → 401，且完全不跑分析", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("今天已跑过 → 跳过；不重复跑分析、不重复清理", async () => {
    mockFindFirst.mockResolvedValue({ id: "run1" } as never);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, skipped: true });
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockCleanupNotifs).not.toHaveBeenCalled();
  });

  it("今天没跑过 → 跑分析，并按 7 天保留期清理通知", async () => {
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(false);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ persist: true })
    );
    expect(mockCleanupNotifs).toHaveBeenCalledWith("u1", 7);
  });

  it("分析抛异常 → 不影响清理，也不返回 500", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockCleanupNotifs).toHaveBeenCalledWith("u1", 7);
    expect(mockCleanupMemories).toHaveBeenCalledWith("u1");
  });
});
