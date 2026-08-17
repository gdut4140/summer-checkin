import { createHash } from "node:crypto";

// 任务拆分 / 过期判断的来源：文档 + 目标 + 说明（与 split 接口保持一致）
export function planTaskSource(plan: {
  document?: string | null;
  goal?: string | null;
  description?: string | null;
}): string {
  return [plan.document, plan.goal, plan.description].filter(Boolean).join("\n\n");
}

export function planTaskSourceHash(plan: {
  document?: string | null;
  goal?: string | null;
  description?: string | null;
}): string {
  return createHash("sha256").update(planTaskSource(plan)).digest("hex");
}
