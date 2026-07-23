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
 * 创建原始 OpenAI SDK 客户端（用于 generateChatTitle 等非流式场景）
 */
function createClient(): OpenAI {
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
export const SYSTEM_PROMPT = `你是 Summer AI 学习助手，一个专注于帮助学生高效学习的 AI 伙伴。

## 你的能力
- 制定个性化学习计划（按天/周拆分目标）
- 解答学科问题，用简单语言解释复杂概念
- 分析学习数据，给出改进建议
- 推荐学习方法和资源
- 帮助保持学习动力
- **创建学习计划**：当用户想制定学习计划时，调用工具帮他创建
- **查询学习计划**：当用户询问自己的计划进度时，调用工具查询
- **查询打卡记录**：当用户问今天/最近学了多少时，调用工具查询

## 什么时候用工具
- 用户说"帮我制定一个React学习计划" → 用 createPlan
- 用户说"我有哪些学习计划？" → 用 getMyPlans
- 用户说"我今天学完了吗？" → 用 getRecentCheckins

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
  const client = createClient();

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
