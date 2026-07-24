// ============================================================
// Day 10 优化：抽取 try-catch 样板为 safeExecute
//
// safeExecute 只负责错误兜底，成功时原样返回（不嵌套 data），
// 确保 LLM 收到的 tool-result 结构不变。
// ============================================================

/**
 * 安全执行异步函数，自动捕获异常并返回标准错误格式。
 * 成功时原样返回 fn() 的结果（不修改结构），
 * 失败时返回 `{ success: false, error: string }`。
 */
export async function safeExecute<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | { success: false; error: string }> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[${label}] 执行失败:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "数据库操作失败，请稍后重试",
    };
  }
}
