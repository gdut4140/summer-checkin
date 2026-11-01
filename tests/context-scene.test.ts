import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { loadSceneContext } from "@/lib/context/scene";

const mockPlan = vi.mocked(prisma.plan.findFirst);
const mockDocument = vi.mocked(prisma.document.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadSceneContext", () => {
  it("智能体页没有绑定业务对象 → 空上下文", async () => {
    const result = await loadSceneContext({
      userId: "u1",
      surface: "agent",
      refId: null,
    });
    expect(result.prompt).toBe("");
  });

  it("计划工作台按 userId + refId 加载，并带上完整文档", async () => {
    mockPlan.mockResolvedValue({
      id: "p1",
      name: "React 七天计划",
      document: "# 计划正文",
    } as never);

    const result = await loadSceneContext({
      userId: "u1",
      surface: "plan",
      refId: "p1",
    });

    expect(mockPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", userId: "u1" },
      })
    );
    expect(result.planName).toBe("React 七天计划");
    expect(result.prompt).toContain("# 计划正文");
    expect(result.prompt).toContain("updatePlanInfo");
  });

  it("文档工作台按 userId + refId 加载；编辑器内容优先", async () => {
    mockDocument.mockResolvedValue({
      id: "d1",
      title: "学习笔记",
      content: "数据库里的旧内容",
    } as never);

    const result = await loadSceneContext({
      userId: "u1",
      surface: "doc",
      refId: "d1",
      clientDocument: "编辑器里的新内容",
    });

    expect(result.documentTitle).toBe("学习笔记");
    expect(result.prompt).toContain("编辑器里的新内容");
    expect(result.prompt).not.toContain("数据库里的旧内容");
  });

  it("对象不属于当前用户 → 空上下文", async () => {
    mockDocument.mockResolvedValue(null);
    const result = await loadSceneContext({
      userId: "u1",
      surface: "doc",
      refId: "d-other",
    });
    expect(result.prompt).toBe("");
  });
});
