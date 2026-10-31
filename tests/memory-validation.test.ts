import { describe, expect, it } from "vitest";
import {
  evidenceMatchesUserMessages,
  validateRawOperations,
  type ValidateContext,
} from "@/lib/memory/validation";

const userMessages = ["我之前主要用 Vue，现在转 React 了"];

const context: ValidateContext = {
  userMessages,
  existing: [
    {
      id: "m1",
      kind: "skill",
      content: "React 熟练",
      normalizedKey: "skill:react",
    },
  ],
  sourceType: "user_statement",
};

function run(operations: unknown[], ctx: ValidateContext = context) {
  return validateRawOperations({ operations }, ctx);
}

describe("validateRawOperations", () => {
  it("合法 ADD：规范化正文与分数，evidence 取自用户原话", () => {
    const result = run([
      {
        op: "ADD",
        kind: "skill",
        content: "  React 熟练  ",
        normalizedKey: "skill:react",
        importance: 1.4,
        confidence: -1,
        evidence: "现在转 React 了",
      },
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.operations).toEqual([
      {
        op: "ADD",
        kind: "skill",
        content: "React 熟练",
        normalizedKey: "skill:react",
        importance: 1,
        confidence: 0,
        validFrom: null,
        validTo: null,
        evidence: "现在转 React 了",
        sourceType: "user_statement",
      },
    ]);
  });

  it("evidence 是改写而非原话 → 丢弃", () => {
    const result = run([
      {
        op: "ADD",
        kind: "skill",
        content: "React 熟练",
        evidence: "用户说他已经会 React 了",
      },
    ]);
    expect(result.operations).toEqual([]);
    expect(result.rejected[0].reason).toBe("evidence_not_found");
  });

  it("没有 evidence → 丢弃", () => {
    const result = run([
      { op: "ADD", kind: "skill", content: "React 熟练" },
    ]);
    expect(result.operations).toEqual([]);
    expect(result.rejected[0].reason).toBe("evidence_not_found");
  });

  it("UPDATE 的 target 必须在已有记忆里 → 否则丢弃", () => {
    const result = run([
      {
        op: "UPDATE",
        targetId: "unknown",
        kind: "skill",
        content: "转用 React",
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.operations).toEqual([]);
    expect(result.rejected[0].reason).toBe("target_not_found");
  });

  it("合法 UPDATE 会被标记为 user_correction", () => {
    const result = run([
      {
        op: "UPDATE",
        targetId: "m1",
        kind: "skill",
        content: "主要使用 React",
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.operations[0]).toMatchObject({
      op: "UPDATE",
      targetId: "m1",
      sourceType: "user_correction",
    });
  });

  it("DELETE 只允许删除已有记忆", () => {
    const result = run([
      {
        op: "DELETE",
        targetId: "m1",
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.operations[0]).toMatchObject({
      op: "DELETE",
      targetId: "m1",
    });
  });

  it("DELETE 允许用目标记忆原文作为证据", () => {
    const result = run([
      {
        op: "DELETE",
        targetId: "m1",
        evidence: "React 熟练",
      },
    ]);
    expect(result.operations[0]).toMatchObject({
      op: "DELETE",
      targetId: "m1",
    });
  });

  it("DELETE 可以省略 evidence，但必须有删除意图", () => {
    const deleteContext: ValidateContext = {
      ...context,
      userMessages: ["把 React 熟练这条忘掉"],
    };
    const result = run([{ op: "DELETE", targetId: "m1" }], deleteContext);
    expect(result.operations[0]).toMatchObject({ op: "DELETE", targetId: "m1" });
  });

  it("没有删除意图的 DELETE → 丢弃", () => {
    const result = run([{ op: "DELETE", targetId: "m1" }]);
    expect(result.operations).toEqual([]);
    expect(result.rejected[0].reason).toBe("delete_intent_not_found");
  });

  it("正文超过 200 字 → 丢弃", () => {
    const result = run([
      {
        op: "ADD",
        kind: "fact",
        content: "很".repeat(201),
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.rejected[0].reason).toBe("content_too_long");
  });

  it("非法 kind → 丢弃", () => {
    const result = run([
      {
        op: "ADD",
        kind: "emotion",
        content: "开心",
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.rejected[0].reason).toBe("kind_invalid");
  });

  it("validTo 早于 validFrom → 丢弃", () => {
    const result = run([
      {
        op: "ADD",
        kind: "goal",
        content: "准备面试",
        evidence: "现在转 React 了",
        validFrom: "2027-01-01",
        validTo: "2026-01-01",
      },
    ]);
    expect(result.rejected[0].reason).toBe("validity_invalid");
  });

  it("超过 3 个操作的部分被丢弃", () => {
    const one = {
      op: "ADD",
      kind: "skill",
      content: "React 熟练",
      evidence: "现在转 React 了",
    };
    const result = run([one, one, one, one]);
    expect(result.operations).toHaveLength(3);
    expect(result.rejected[0].reason).toBe("too_many_operations");
  });

  it("非法 normalizedKey → 置空，而不是整条丢弃", () => {
    const result = run([
      {
        op: "ADD",
        kind: "skill",
        content: "React 熟练",
        normalizedKey: "Skill React!",
        evidence: "现在转 React 了",
      },
    ]);
    expect(result.operations[0]).toMatchObject({ normalizedKey: null });
  });

  it("NOOP 原样保留", () => {
    const result = run([{ op: "NOOP", reason: "寒暄" }]);
    expect(result.operations).toEqual([{ op: "NOOP", reason: "寒暄" }]);
  });

  it("同一批里 UPDATE 旧状态后，不再 ADD 同一个 normalizedKey", () => {
    const result = run([
      {
        op: "UPDATE",
        targetId: "m1",
        kind: "skill",
        content: "主要使用 React",
        normalizedKey: "skill:react",
        evidence: "我之前主要用 Vue，现在转 React 了",
      },
      {
        op: "ADD",
        kind: "skill",
        content: "Vue 熟练",
        normalizedKey: "skill:react",
        evidence: "我之前主要用 Vue",
      },
    ]);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({ op: "UPDATE", targetId: "m1" });
    expect(result.rejected[0].reason).toBe("conflicts_with_update");
  });

  it("同一批里 UPDATE 旧状态后，不再 ADD 旧状态正文", () => {
    const result = run([
      {
        op: "UPDATE",
        targetId: "m1",
        kind: "skill",
        content: "主要使用 React",
        evidence: "我之前主要用 Vue，现在转 React 了",
      },
      {
        op: "ADD",
        kind: "skill",
        content: "React 熟练",
        evidence: "我之前主要用 Vue",
      },
    ]);
    expect(result.operations).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("conflicts_with_update");
  });
});

describe("evidenceMatchesUserMessages", () => {
  it("忽略空白与标点", () => {
    expect(
      evidenceMatchesUserMessages("我现在主要使用 react", [
        "我现在主要使用 React。",
      ])
    ).toBe(true);
  });

  it("允许拼接同一窗口里的多条用户消息", () => {
    expect(
      evidenceMatchesUserMessages(
        "我之前主要使用 Vue，已经用了两年。我现在改成主要使用 React 了。",
        ["我之前主要使用 Vue，已经用了两年。", "我现在改成主要使用 React 了。"]
      )
    ).toBe(true);
  });

  it("允许模型用斜杠连接多条原话", () => {
    expect(
      evidenceMatchesUserMessages("我享受披萨 / 我喜欢吃披萨", [
        "我享受披萨",
        "我喜欢吃披萨",
      ])
    ).toBe(true);
  });

  it("过短的 evidence 不算数", () => {
    expect(evidenceMatchesUserMessages("我", ["我用 React"])).toBe(false);
  });
});
