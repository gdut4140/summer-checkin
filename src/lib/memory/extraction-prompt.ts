// ============================================================
// Memory v2 抽取 Prompt
//
// 设计要点（与 manager/validation 的分工）：
//   · 模型只提议 ADD / UPDATE / DELETE / NOOP；
//   · 每条操作必须带 evidence（用户原话摘录）；
//   · 服务端会用 validation.ts 逐条校验，不合规直接丢弃。
//
// 不要把“是否值得保存”完全交给模型——门控（extraction.ts）先做一次规则过滤。
// ============================================================

import type { SimilarMemory } from "./store";

export const EXTRACTION_PROMPT = `你是长期记忆提取器。你的任务是从最近对话中提取**关于用户本人**的稳定信息，供学习助手长期使用。

## 硬规则（违反的操作会被服务端丢弃）
1. 只有「用户」消息能作为事实来源。AI 回复只是上下文，不能当作用户事实。
2. 每条 ADD / UPDATE / DELETE 必须附 evidence：用户原话中的连续摘录，尽量逐字，不要改写、不要总结。找不到原话就不要输出该操作。
3. 一次最多 3 个操作。没有值得保存的信息就只输出 NOOP。
   例外：DELETE 可以省略 evidence，但 targetId 必须来自「已有记忆」，且用户消息里必须有“忘掉/删除/去掉/不要记”这类明确意图。
4. 不要保存：AI 的建议、推测、工具返回内容、临时情绪、一次性任务指令、闲聊寒暄。
5. 同义或重复的信息 → 用 UPDATE 指向已有记忆的 targetId，不要 ADD。
6. 用户修正旧信息（“之前……现在……”）→ UPDATE targetId，content 写**当前状态**，不要把新旧状态写在一起；
   **不要同时为被修正的旧状态再输出 ADD**。同一窗口里的多条用户消息可以拼成一条 evidence。
7. 有时间边界的目标 → 填 validFrom / validTo（YYYY-MM-DD）。不明确就不要填。

## 记忆类型
- goal: 当前阶段想达成的目标（“准备 2027 春招前端实习”）
- skill: 已具备的技术/能力及程度（“React 熟练”“TypeScript 用了 2 年”）
- weakness: 明确的薄弱点/困难（“算法题容易卡壳”）
- preference: 学习/生活/交互偏好，包括喜欢的事物（食物、游戏、角色等）和希望 AI 怎么做（“喜欢先讲原理再看代码”）
- habit: 可观察的重复行为/节奏（“每天学习 2 小时”“周末容易偷懒”）
- fact: 不直接改变策略的背景事实（“计算机专业大三”“用 Windows”）

## 分类边界
- “我在学 React” → goal（有学习意图/时间性）；“我会 React” → skill。
- “我喜欢早上学习” → habit（可观察行为）；“我希望回答简短” → preference（明确要求）。
- “我算法不行” → weakness，不要写成 skill。
- AI 转述的文档内容、任务列表 → 一律忽略。

## importance（0-1）
- 0.9-1.0：核心目标、关键弱点，直接影响计划
- 0.7-0.8：重要偏好、已掌握技能
- 0.5-0.6：一般习惯、背景事实
- 0.3-0.4：零散但可能有用的信息
- <0.3：不要提取

## confidence（0-1）
- 1.0：用户非常明确地说出
- 0.8：比较明确但未展开
- 0.5：简略提及
- <0.4：不要提取

## normalizedKey（可选）
如果这条信息有稳定的主题键，用以下格式之一；没有就省略：
- goal:goal:frontend-internship-2027
- skill:react
- weakness:algorithm
- preference:explanation-style
- habit:study-rhythm
- fact:major
只能使用小写字母、数字、冒号、下划线、连字符、点，最长 80 字符。

## 输出格式（严格 JSON，不要 Markdown）
{
  "operations": [
    {
      "op": "ADD",
      "kind": "skill",
      "content": "主要使用 React，TypeScript 用了 2 年",
      "normalizedKey": "skill:react",
      "importance": 0.7,
      "confidence": 0.9,
      "evidence": "我现在主要使用 React"
    },
    {
      "op": "UPDATE",
      "targetId": "已有记忆的 id",
      "kind": "skill",
      "content": "主要使用 React，已从 Vue 转向 React",
      "importance": 0.7,
      "confidence": 0.9,
      "evidence": "我之前主要用 Vue，现在转 React 了"
    },
    {
      "op": "NOOP",
      "reason": "寒暄，无用户信息"
    }
  ]
}

targetId 只能取自下方「已有记忆」列表里的 id。`;

export interface ExtractionMessage {
  role: string;
  content: string;
}

export function buildExtractionUserMessage(input: {
  messages: ExtractionMessage[];
  existing: SimilarMemory[];
}): string {
  const conversation = input.messages
    .map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`)
    .join("\n");

  const existing =
    input.existing.length > 0
      ? input.existing
          .map(
            (m) =>
              `- id:${m.id} | kind:${m.kind} | key:${m.normalizedKey ?? "-"} | ${m.content}`
          )
          .join("\n")
      : "（暂无）";

  return `## 最近对话\n${conversation}\n\n## 已有记忆（用于语义匹配与 targetId）\n${existing}`;
}
