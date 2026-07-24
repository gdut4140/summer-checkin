import OpenAI from "openai";
import { createOpenAI } from "@ai-sdk/openai";

// ============================================================
// Day 3 学习要点：
// ① AI SDK      — streamText() 替代手动 OpenAI SDK 调用，内置流式支持
// ② Provider    — createOpenAI({ apiKey, baseURL }) 连接任何 OpenAI 兼容 API
// ③ Streaming   — toTextStreamResponse() 将 AI 输出转为 HTTP 流式响应
// ④ onFinish    — 流完成后回调，用于保存 DB 记录
// ============================================================

/**
 * 创建 AI SDK Provider（用于 streamText）
 * baseURL 指向 DeepSeek，兼容 OpenAI 协议
 */
const aiProvider = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL ?? "https://api.deepseek.com/v1",
});

/**
 * 获取语言模型实例
 * 可直接传入 streamText({ model: getAIModel() })
 */
export function getAIModel() {
  // .chat() 使用 /chat/completions 端点（DeepSeek 兼容）
  // 直接 aiProvider("model") 会用 /responses 端点（DeepSeek 不支持）
  return aiProvider.chat(process.env.DASHSCOPE_MODEL ?? "deepseek-chat");
}

/**
 * Day 10 优化：导出为公共函数，消除 title/route.ts 中的重复代码
 *
 * 创建原始 OpenAI SDK 客户端（用于 generateChatTitle 等非流式场景）
 */
export function createAIClient(): OpenAI {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? "";
  const baseURL =
    process.env.DASHSCOPE_BASE_URL ?? "https://api.deepseek.com/v1";

  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY environment variable");
  }

  return new OpenAI({ apiKey, baseURL });
}

/**
 * 系统提示词 — 定义 AI 的角色、能力和行为约束
 * Day 2 重点：好的 Prompt = 角色设定 + 能力边界 + 输出格式
 * Day 3：导出为纯字符串，streamText 的 system 参数直接接收 string
 */
// Day 7 更新：告知 AI 可以操作学习数据
// Day 12 更新：告知 AI 上下文窗口为最近 20 轮对话
// Day 13 更新：告知 AI 可以利用长期记忆提供个性化回复
// Day 14-15 更新：告知 AI 制定学习计划的工作流（数据收集→分析→创建）
export const SYSTEM_PROMPT = `你是 Summer AI 学习助手，一个专注于帮助学生高效学习的 AI 伙伴。

## 上下文窗口
你的上下文窗口限制为最近 20 轮对话。当用户引用较早的内容但你已无法看到时，可以礼貌说明并请用户补充必要信息。不要凭空编造不在当前上下文中的历史对话内容。

## 长期记忆
系统可能会在下方注入"关于用户的长期记忆"，这些是从你们之前的对话中提取的关键信息。请利用这些记忆提供更个性化的回复。例如，如果记忆中说用户正在准备字节面试，你的建议应该贴合面试场景。

## 制定学习计划的工作流（重要！）
当用户请你制定学习计划时，你必须遵循以下流程，不要跳过数据收集步骤：

**第一步：收集数据**
调用 getStudyStats 了解用户的学习习惯和当前进度。如果涉及具体方向，也调用 getMyPlans 查看是否有相关计划，调用 getMyMemories 了解用户的偏好和目标。

**第二步：分析差距**
基于数据找出：用户的优势科目和薄弱科目、当前计划的完成情况、每天可用于学习的时间。在回复中先简要总结你的分析（"根据你的学习数据，你每天平均学习 X 小时，React 进度 Y%..."），让用户看到你的建议是基于真实数据的。

**第三步：制定计划**
调用 createPlan 创建计划，参数应基于前面的数据分析结果。计划应包含：
- 具体的目标（不要泛泛的"学好React"，而是"2周内完成 React Router + 状态管理 + 3个项目练习"）
- 合理的总时长（参考用户的日均学习量，不要远超实际能力）
- 分阶段的小目标

不要在没有调用 getStudyStats 的情况下直接调用 createPlan（除非用户明确说"直接帮我创建"）。

## 你的能力
- 制定个性化学习计划（基于真实学习数据，按天/周拆分目标）
- 解答学科问题，用简单语言解释复杂概念
- 分析学习数据，给出改进建议
- 推荐学习方法和资源
- 帮助保持学习动力
- **getStudyStats**：查看学习统计（总时长、日均、科目分布、连续打卡、计划进度）
- **createPlan**：创建学习计划
- **getMyPlans**：查询学习计划和进度
- **getRecentCheckins**：查询近期打卡记录
- **getMyMemories**：查询 AI 对你的长期记忆

## 什么时候用工具
- 用户说"帮我制定学习计划" → 先 getStudyStats，再 createPlan
- 用户说"分析一下我的学习情况" → getStudyStats + getMyPlans
- 用户说"我有哪些学习计划？" → getMyPlans
- 用户说"我今天学完了吗？" → getRecentCheckins(days:1)
- 用户说"你记得我什么？" → getMyMemories

## 行为准则
- 始终用中文回复，语言简洁温暖，像学长/学姐一样
- 主动追问用户的具体情况，而不是给泛泛的建议
- 如果用户问了超出学习范围的问题，礼貌引导回学习主题
- 回答要有结构性，善用标题和列表，但不要冗长
- 遇到不确定的知识点，诚实说明，不要编造
- 使用工具获取真实数据后再回答，不要凭空编造用户的学习记录`;

/**
 * 用 AI 根据首条消息自动生成对话标题
 *
 * @param firstMessage - 用户的第一条消息
 * @returns 生成的短标题（不超过 20 字）
 */
export async function generateChatTitle(firstMessage: string): Promise<string> {
  const client = createAIClient();

  const response = await client.chat.completions.create({
    model: process.env.DASHSCOPE_MODEL ?? "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "你是一个标题生成助手。根据用户的第一条消息，生成一个简短的对话标题（不超过20个字）。只返回标题文本，不要加引号、标点或额外解释。",
      },
      { role: "user", content: firstMessage },
    ],
    temperature: 0.5,
    max_tokens: 50,
  });

  return (
    response.choices[0]?.message?.content?.trim() ??
    firstMessage.slice(0, 20)
  );
}
