// ============================================================
// 会话上下文工程配置（集中管理，方便调整）
// ============================================================

export const CONTEXT_CONFIG = {
  /** 最近保留的原始消息条数（不含当前用户消息） */
  recentMessageWindow: 20,

  /** 单次压缩最多处理的原始消息条数 */
  summaryBatchMessages: 40,

  /** 送入摘要模型的文本上限（字符） */
  summaryInputMaxChars: 16_000,

  /** 单条消息送入摘要时的截断长度 */
  summaryMessageMaxChars: 800,

  /** 摘要最大长度 */
  summaryMaxChars: 1_200,

  /** AgentState 限制 */
  workingMemoryLimit: 10,
  todoLimit: 20,
  itemMaxChars: 200,

  /** searchConversationHistory */
  historySearchLimit: 5,
  historySearchQueryMaxChars: 200,

  /** 存进 rawParts 的单个 tool input/output 上限（字符） */
  rawToolPayloadMaxChars: 4_000,
} as const;
