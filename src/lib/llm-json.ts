// ============================================================
// 模型 JSON 输出的公共处理
//
// 模型经常把 JSON 包在 markdown 代码围栏里（即使 prompt 明确说了不要），
// 所以「解析前先剥围栏」这一步在项目里有三处需要：
//   · agent/service.ts   — 计划草案
//   · plan-split.ts      — 任务拆分 / 变更判断
//   · agent/runtime.ts   — 学习分析
// 收在这里，避免同一段正则抄三份。
// ============================================================

/** 提取模型输出中的 JSON 主体（兼容可能的 markdown 代码围栏） */
export function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}
