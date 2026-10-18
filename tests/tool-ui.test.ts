import { describe, expect, it, vi } from "vitest";

// 工具卡片的展示元数据是 fail-closed 白名单：新加的工具不会自动出现在卡片上。
// 漏登记的表现是「卡片显示成裸工具名」，属于静默降级——能跑，但用户看到
// updateDocument 这种英文标识符。所以逐个核对能到达模型的能力都有登记。
//
// 分类（读/写）也要和 router.ts 的白名单对得上：读工具折叠、写工具展开，
// 这是用户直接能感觉到的差异，两边漂移了不会报错。

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { SURFACE_POLICY } from "@/lib/tools/router";
import { TOOL_UI, toolUi } from "@/lib/tools/tool-ui";

/** 所有场景的白名单并集 = 真正可能被模型调用的全部工具 */
function allWhitelistedTools(): string[] {
  const names = new Set<string>();
  for (const policy of Object.values(SURFACE_POLICY)) {
    for (const name of policy.tools) names.add(name);
  }
  return [...names].sort();
}

describe("TOOL_UI 登记完整性", () => {
  it("每个能到达模型的工具都有展示元数据", () => {
    const missing = allWhitelistedTools().filter((name) => !(name in TOOL_UI));
    expect(missing).toEqual([]);
  });

  it("没有登记了却已经不在白名单里的僵尸条目", () => {
    const whitelisted = new Set(allWhitelistedTools());
    const stale = Object.keys(TOOL_UI).filter((name) => !whitelisted.has(name));
    expect(stale).toEqual([]);
  });

  it("每条登记都有动作名和合法分类", () => {
    for (const [name, spec] of Object.entries(TOOL_UI)) {
      expect(spec.label.trim(), `${name} 的动作名为空`).not.toBe("");
      expect(["read", "write"], `${name} 分类非法`).toContain(spec.kind);
    }
  });
});

describe("读/写分类与 router 白名单一致", () => {
  it("纯读工具都是 read", () => {
    for (const name of SURFACE_POLICY.doc.tools) {
      if (name === "updateDocument") continue; // 文档工作台唯一的写工具
      expect(TOOL_UI[name]?.kind, `${name} 应为 read`).toBe("read");
    }
  });

  it("会改数据的工具都是 write", () => {
    const writes = [
      "createPlan",
      "breakdownPlanTasks",
      "updateTaskStatus",
      "createTodo",
      "updateTodo",
      "deleteTodo",
      "updatePlanInfo",
      "updateDocument",
    ];
    for (const name of writes) {
      expect(TOOL_UI[name]?.kind, `${name} 应为 write`).toBe("write");
    }
  });
});

describe("toolUi 兜底", () => {
  it("未登记的工具不崩，退化成裸名", () => {
    expect(toolUi("someBrandNewTool")).toEqual({
      label: "someBrandNewTool",
      kind: "write",
    });
  });

  it("summarize 面对畸形入参不抛错", () => {
    for (const spec of Object.values(TOOL_UI)) {
      if (!spec.summarize) continue;
      expect(() => spec.summarize!(null, undefined)).not.toThrow();
      expect(() => spec.summarize!("not an object", 42)).not.toThrow();
      expect(() => spec.summarize!({ content: 123 }, {})).not.toThrow();
    }
  });

  it("updateDocument 的摘要只报字数，绝不带上正文", () => {
    const long = "x".repeat(100000);
    const summary = TOOL_UI.updateDocument.summarize!({ content: long }, { success: true });
    expect(summary).toBe("100000 字");
  });
});
