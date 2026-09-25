import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Route 级测试：钉住「鉴权失败时任务根本不会启动」这条链路。
// 纯函数测试（cron-auth.test.ts）只保证 isCronAuthorized 判对，
// 但真正危险的是 route 忘了调用它、或 401 前已经进了任务执行——
// 所以这里 mock 掉所有副作用依赖，断言 401 + runLearningAgent 零调用。

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    plan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));
vi.mock("@/lib/agent", () => ({
  runLearningAgent: vi.fn(),
}));
vi.mock("@/lib/agent/weekly", () => ({
  createWeeklyReportNotification: vi.fn(),
}));
vi.mock("@/lib/notification", () => ({
  cleanupOldNotifications: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/memory", () => ({
  cleanupColdMemories: vi.fn().mockResolvedValue({ deleted: 0 }),
}));

import { GET } from "@/app/api/agent/cron/daily/route";
import { runLearningAgent } from "@/lib/agent";
import { NextRequest } from "next/server";

function req(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/agent/cron/daily", { headers });
}

const mockRun = vi.mocked(runLearningAgent);

describe("GET /api/agent/cron/daily 鉴权链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("未配置 CRON_SECRET → 401，且完全不执行 Agent 任务", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("未配置 CRON_SECRET 时即使携带正确格式的 Bearer → 仍 401（fail-closed）", async () => {
    const res = await GET(req({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("已配置但未携带 Authorization → 401，不执行任务", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("已配置但凭据错误 → 401，不执行任务", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("凭据正确 → 放行（prisma 全空时正常返回统计，任务链路可达）", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats.totalUsers).toBe(0);
  });
});
