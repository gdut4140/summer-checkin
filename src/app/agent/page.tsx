import { requireAuth } from "@/lib/auth-utils";
import { RainforestExplorer } from "@/components/agent/rainforest-explorer";

// 智能体独立全屏页面：不在 (dashboard) 布局下 → 无顶部导航、无悬浮球；根布局提供背景视频。
// ?new=1（从「新建计划」跳转）→ 初始即进入计划构建模式。
export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  await requireAuth();
  const { new: isNew } = await searchParams;
  return <RainforestExplorer initialPlanner={isNew === "1"} />;
}
