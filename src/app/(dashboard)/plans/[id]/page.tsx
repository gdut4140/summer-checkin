import { redirect } from "next/navigation";

// 「查看计划」已与「文档模式」合并，统一进工作室（可编辑的 Markdown 文档）
export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/plans/${id}/studio`);
}
