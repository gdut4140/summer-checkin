import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
  baseURL: "https://api.deepseek.com/v1",
});

export async function getAIResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[]
): Promise<string> {
  const systemPrompt: { role: "system"; content: string } = {
    role: "system",
    content:
      "你是一个有帮助的学习助手。帮助学生制定学习计划、改进学习方法、管理时间和保持动力。用中文回复，保持简洁和鼓励性。禁止使用破折号。",
  };

  const response = await client.chat.completions.create({
    model: process.env.DASHSCOPE_MODEL ?? "deepseek-chat",
    messages: [systemPrompt, ...messages],
    temperature: 0.7,
    max_tokens: 1000,
  });

  return response.choices[0]?.message?.content ?? "Sorry, I could not generate a response.";
}
