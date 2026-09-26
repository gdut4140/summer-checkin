import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

// 这段判断决定「cron 接口开不开门」。原实现 fail-open：
// secret 未配置时条件短路，等于没有锁（#4）。三类分支各自钉住——
// 未配置、配置后凭据错误、配置后凭据正确——防止任何一侧改回放行。

describe("isCronAuthorized", () => {
  it("未配置 CRON_SECRET → 拒绝（fail-closed，修复 #4 的核心行为）", () => {
    expect(isCronAuthorized(null, undefined)).toBe(false);
    expect(isCronAuthorized("Bearer secret", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer secret", null)).toBe(false);
    expect(isCronAuthorized(null, "")).toBe(false);
  });

  it("已配置但未携带 Authorization → 拒绝", () => {
    expect(isCronAuthorized(null, "s3cr3t")).toBe(false);
  });

  it("已配置但凭据不匹配 → 拒绝（含格式错误/前缀错误）", () => {
    expect(isCronAuthorized("Bearer wrong", "s3cr3t")).toBe(false);
    expect(isCronAuthorized("s3cr3t", "s3cr3t")).toBe(false); // 缺 Bearer 前缀
    expect(isCronAuthorized("Bearer s3cr3t ", "s3cr3t")).toBe(false); // 尾随空白
  });

  it("已配置且 Bearer 完全一致 → 放行", () => {
    expect(isCronAuthorized("Bearer s3cr3t", "s3cr3t")).toBe(true);
  });
});
