import { redirect } from "next/navigation";

// Agent 功能已集成到雨林探索器（右下角 🌿 按钮），
// 右面板 Agent → 教练 / 通知 / 日志 / 工作台
export default function AgentPage() {
  redirect("/dashboard");
}
