import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeExecute } from "@/lib/tools/utils";

beforeEach(() => {
  // safeExecute 失败路径会 console.error，压掉以免污染测试输出
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("safeExecute", () => {
  it("成功时原样返回结果，不额外包一层 data", async () => {
    // 这一点很关键：包一层会改变 LLM 收到的 tool-result 结构
    const result = await safeExecute("t", async () => ({ ok: 1, list: [1, 2] }));
    expect(result).toEqual({ ok: 1, list: [1, 2] });
  });

  it("原始类型也不做包装", async () => {
    expect(await safeExecute("t", async () => 42)).toBe(42);
    expect(await safeExecute("t", async () => null)).toBeNull();
  });

  it("抛 Error 时返回 { success:false, error }", async () => {
    const result = await safeExecute("t", async () => {
      throw new Error("数据库连接失败");
    });
    expect(result).toEqual({ success: false, error: "数据库连接失败" });
  });

  it("抛出非 Error 时兜底为通用提示，不泄露内部细节", async () => {
    const result = await safeExecute("t", async () => {
      throw "字符串异常";
    });
    expect(result).toEqual({ success: false, error: "数据库操作失败，请稍后重试" });
  });

  it("失败不向上抛，保证 agent 工具循环能继续", async () => {
    await expect(
      safeExecute("t", async () => {
        throw new Error("x");
      })
    ).resolves.toBeDefined();
  });
});
