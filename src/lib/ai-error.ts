// ============================================================
// 把 API 返回的错误转成可以直接展示的一句话
//
// /api/ai 的失败响应是 JSON：{ "error": "AI 服务暂时不可用，请稍后重试" }。
// AI SDK 的 transport 在非 2xx 时会把整个响应体塞进 error.message，
// 界面直接 toast(error.message) 就会显示一段 JSON。
// ============================================================

export function readableAIError(
  error: unknown,
  fallback = "AI 回复失败"
): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const fromJson = (text: string): string | null => {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error;
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // 不是纯 JSON，继续尝试从包装文本里提取
    }
    return null;
  };

  const direct = fromJson(trimmed);
  if (direct) return direct;

  // AI SDK 可能把 body 拼在 message 里：AI_APICallError: {"error":"..."}
  const match = trimmed.match(/"error"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (match) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`);
      if (typeof decoded === "string" && decoded.trim()) return decoded;
    } catch {
      // 保底用未解码的原文
    }
  }

  return trimmed;
}
