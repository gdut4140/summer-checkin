import OpenAI from "openai";

// ============================================================
// Day 2 学习要点：
// ① OpenAI SDK  — new OpenAI({ apiKey, baseURL }) 创建客户端
// ② API Key    — 从 process.env 读取，只在服务端可用
// ③ Model      — 通过 model 参数选择，不同厂商有不同模型名
// ④ Prompt     — system prompt 定义 AI 人设和行为边界
// ============================================================

/**
 * 创建 AI 客户端
 * baseURL 决定调用哪个厂商的 API：
 *   DeepSeek:  https://api.deepseek.com/v1
 *   OpenAI:    https://api.openai.com/v1
 *   Groq:      https://api.groq.com/openai/v1
 *   通义千问:   https://dashscope.aliyuncs.com/compatible-mode/v1
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
 */
const SYSTEM_PROMPT: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
  role: "system",
  content: `你是 Summer AI 学习助手，一个专注于帮助学生高效学习的 AI 伙伴。

## 你的能力
- 制定个性化学习计划（按天/周拆分目标）
- 解答学科问题，用简单语言解释复杂概念
- 分析学习数据，给出改进建议
- 推荐学习方法和资源
- 帮助保持学习动力

## 行为准则
- 始终用中文回复，语言简洁温暖，像学长/学姐一样
- 主动追问用户的具体情况，而不是给泛泛的建议
- 如果用户问了超出学习范围的问题，礼貌引导回学习主题
- 回答要有结构性，善用标题和列表，但不要冗长
- 遇到不确定的知识点，诚实说明，不要编造`,
};

interface ChatOptions {
  /** 模型名称，默认从环境变量读取 */
  model?: string;
  /** 温度 0-2，越高越有创造性，默认 0.7 */
  temperature?: number;
  /** 最大输出 token 数，默认 2000 */
  maxTokens?: number;
}

/**
 * 核心函数：发送消息给 AI 并获取回复
 *
 * @param messages - 对话历史 [{ role: "user", content: "..." }]
 * @param options - 可选配置
 * @returns AI 的回复文本
 */
export async function getAIResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  options: ChatOptions = {}
): Promise<string> {
  const client = createClient();

  const {
    model = process.env.DASHSCOPE_MODEL ?? "deepseek-chat",
    temperature = 0.7,
    maxTokens = 2000,
  } = options;

  const response = await client.chat.completions.create({
    model,
    messages: [SYSTEM_PROMPT, ...messages],
    temperature,
    max_tokens: maxTokens,
  });

  return (
    response.choices[0]?.message?.content ??
    "抱歉，我暂时无法生成回复，请稍后重试。"
  );
}

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
