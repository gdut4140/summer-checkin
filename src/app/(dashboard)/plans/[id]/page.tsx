import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { PlanForm } from "@/components/plans/plan-form";
import { notFound } from "next/navigation";

export default async function PlanEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  if (id === "new") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            新建计划
          </h1>
          <p className="text-muted-foreground mt-1">
            制定你的暑假学习目标和计划。
          </p>
        </div>
        <PlanForm plan={null} />
      </div>
    );
  }

  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan || plan.userId !== user.id) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          编辑计划
        </h1>
        <p className="text-muted-foreground mt-1">修改你的学习计划和目标。</p>
      </div>
      <PlanForm plan={plan} />
    </div>
  );
}
