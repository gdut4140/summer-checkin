import { prisma } from "@/lib/prisma";
import { syncTasksFromDocument } from "@/lib/studio/plan-sync";

/**
 * 注册瞬间：把新用户引导模板克隆给新用户。
 * - 通关计划（PlanTemplate）→ Plan：document 里的「## 任务安排」段落
 *   经 syncTasksFromDocument 同步成 PlanTask，新用户一进计划页就有带任务的真实计划。
 * - 引导文档（DocumentTemplate）→ Document：出现在文档列表，可点开阅读/编辑/删除。
 * 模板缺失时静默跳过；单个失败不阻断整体，也绝不影响注册本身。
 */
export async function cloneGuideTemplates(userId: string): Promise<void> {
  const planTemplates = await prisma.planTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });

  for (const t of planTemplates) {
    try {
      const plan = await prisma.plan.create({
        data: {
          userId,
          name: t.name,
          description: t.description,
          goal: t.goal,
          document: t.document,
          status: "active",
        },
      });
      if (t.document) {
        await syncTasksFromDocument(plan.id, userId, t.document).catch(() => {});
      }
    } catch (e) {
      console.error("[onboard] 克隆计划模板失败:", e);
    }
  }

  const docTemplates = await prisma.documentTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });

  for (const t of docTemplates) {
    try {
      await prisma.document.create({
        data: { userId, title: t.title, content: t.content },
      });
    } catch (e) {
      console.error("[onboard] 克隆文档模板失败:", e);
    }
  }
}
