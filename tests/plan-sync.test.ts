import { beforeEach, describe, expect, it, vi } from "vitest";

// 「## 任务安排」的清单渲染与解析是一对必须锁在一起的东西：
// 序列化器写什么格式，解析器就得读得回来。所以这里以往返测试为主。
//
// 最关键的一条是「分组后解析器不能停在第一个 ###」——旧实现的终止条件是
// 「任何标题都结束段落」，加了 ### Day N 分组后会返回 0 条，而 syncTasksFromDocument
// 对空结果是静默 early-return：勾选框全部失效，且没有任何报错。这类失败不写测试
// 就发现不了。

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planTask: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { parseTaskSection, syncTasksFromDocument, splitTitleDay } from "@/lib/studio/plan-sync";
import {
  planDraftToMarkdown,
  planWithTasksToMarkdown,
  ensureTaskSectionInDocument,
} from "@/lib/studio/plan-serialize";
import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.planTask.findMany);
const mockCreate = vi.mocked(prisma.planTask.create);
const mockUpdate = vi.mocked(prisma.planTask.update);

describe("parseTaskSection", () => {
  it("旧格式：平铺清单照常解析，日期为 null（向后兼容）", () => {
    const doc = [
      "# 计划",
      "",
      "## 任务安排",
      "",
      "- [ ] 任务A",
      "- [x] 任务B",
      "",
      "## 学习笔记",
    ].join("\n");

    expect(parseTaskSection(doc)).toEqual([
      { title: "任务A", done: false, dayNumber: null, weekNumber: null },
      { title: "任务B", done: true, dayNumber: null, weekNumber: null },
    ]);
  });

  it("⚠️ 分组格式：不能停在第一个 ### 分组标题上（否则同步静默失效）", () => {
    const doc = [
      "## 任务安排",
      "",
      "### 第 1 周 · Day 1",
      "",
      "- [ ] 任务A",
      "- [x] 任务B",
      "",
      "### Day 2",
      "",
      "- [ ] 任务C",
    ].join("\n");

    const items = parseTaskSection(doc);
    // 返回 0 条就说明又踩回「任何标题都结束段落」那个坑了
    expect(items).toHaveLength(3);
    expect(items).toEqual([
      { title: "任务A", done: false, dayNumber: 1, weekNumber: 1 },
      { title: "任务B", done: true, dayNumber: 1, weekNumber: 1 },
      { title: "任务C", done: false, dayNumber: 2, weekNumber: null },
    ]);
  });

  it("段落结束于同级或更浅的标题", () => {
    const doc = [
      "## 任务安排",
      "",
      "- [ ] 段落内的",
      "## 学习笔记",
      "- [ ] 不该被收进来",
      "# 一级标题",
      "- [ ] 也不该",
    ].join("\n");

    expect(parseTaskSection(doc).map((i) => i.title)).toEqual(["段落内的"]);
  });

  it("比分组更深的标题（组内的 #### 备注）不重置当前日期", () => {
    const doc = [
      "## 任务安排",
      "",
      "### Day 3",
      "",
      "#### 备注",
      "",
      "- [ ] 仍然属于 Day 3",
    ].join("\n");

    expect(parseTaskSection(doc)).toEqual([
      { title: "仍然属于 Day 3", done: false, dayNumber: 3, weekNumber: null },
    ]);
  });

  it("「## 任务清单」也认", () => {
    const doc = ["## 任务清单", "", "### Day 5", "", "- [ ] X"].join("\n");
    expect(parseTaskSection(doc)).toEqual([
      { title: "X", done: false, dayNumber: 5, weekNumber: null },
    ]);
  });

  it("标题里带别的内容不会被误认成任务段落", () => {
    const doc = ["### 第 1 周 · Day 1 · 任务安排", "", "- [ ] 不该被收"].join("\n");
    expect(parseTaskSection(doc)).toEqual([]);
  });
});

describe("任务清单序列化", () => {
  it("有日期的任务按天分组，标出周与天", () => {
    const md = planDraftToMarkdown({
      name: "计划",
      goal: "目标",
      tasks: [
        { title: "A", dayNumber: 1, weekNumber: 1 },
        { title: "B", dayNumber: 1, weekNumber: 1 },
        { title: "C", dayNumber: 2, weekNumber: 1 },
      ],
    });

    const section = md.slice(md.indexOf("## 任务安排"));
    expect(section).toContain("### 第 1 周 · Day 1");
    expect(section).toContain("### 第 1 周 · Day 2");
    // Day 1 的两条在同一组里
    expect(section.indexOf("- [ ] A")).toBeLessThan(section.indexOf("### 第 1 周 · Day 2"));
  });

  it("全都没有日期时，输出与旧格式完全一致（向后兼容）", () => {
    const md = planWithTasksToMarkdown({ name: "计划", goal: "目标" }, [
      { title: "A" },
      { title: "B", status: "done" },
    ]);

    const section = md.slice(md.indexOf("## 任务安排"));
    expect(section).not.toContain("###");
    expect(section).toContain("- [ ] A");
    expect(section).toContain("- [x] B");
  });

  it("无日期的任务平铺在最前，不与分组混在一起", () => {
    const md = planWithTasksToMarkdown({ name: "计划" }, [
      { title: "无日期" },
      { title: "Day1 的", dayNumber: 1 },
    ]);

    const section = md.slice(md.indexOf("## 任务安排"));
    expect(section.indexOf("- [ ] 无日期")).toBeLessThan(section.indexOf("### Day 1"));
  });

  it("按 (周, 天) 升序排列分组", () => {
    const md = planWithTasksToMarkdown({ name: "计划" }, [
      { title: "第2周第1天", dayNumber: 1, weekNumber: 2 },
      { title: "第1周第3天", dayNumber: 3, weekNumber: 1 },
      { title: "第1周第1天", dayNumber: 1, weekNumber: 1 },
    ]);

    const section = md.slice(md.indexOf("## 任务安排"));
    const order = ["第1周第1天", "第1周第3天", "第2周第1天"].map((t) =>
      section.indexOf(t)
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("ensureTaskSectionInDocument 补出来的段落同样带分组", () => {
    const out = ensureTaskSectionInDocument("# 计划\n\n## 学习笔记\n", [
      { title: "A", status: "pending", dayNumber: 4, weekNumber: 2 },
    ]);

    expect(out).toContain("## 任务安排");
    expect(out).toContain("### 第 2 周 · Day 4");
    expect(out).toContain("- [ ] A");
    // 仍然插在学习笔记之前
    expect(out.indexOf("## 任务安排")).toBeLessThan(out.indexOf("## 学习笔记"));
  });

  it("已有任务安排段落时原样返回，不覆盖用户/AI 的编辑", () => {
    const doc = "# 计划\n\n## 任务安排\n\n- [ ] 用户自己写的\n";
    expect(ensureTaskSectionInDocument(doc, [{ title: "别的", status: "pending" }])).toBe(doc);
  });
});

describe("序列化 → 解析 往返", () => {
  it("标题、勾选状态、日期全部还原", () => {
    const tasks = [
      { title: "拆解目标", dayNumber: 1, weekNumber: 1 },
      { title: "学核心概念", dayNumber: 1, weekNumber: 1, status: "done" },
      { title: "做练习", dayNumber: 2, weekNumber: 1 },
      { title: "没排期的", dayNumber: null, weekNumber: null },
    ];
    const md = planDraftToMarkdown({ name: "计划", goal: "目标", tasks });

    const parsed = parseTaskSection(md);
    expect(parsed).toHaveLength(tasks.length);
    for (const t of tasks) {
      const got = parsed.find((p) => p.title === t.title);
      expect(got, `丢失任务 ${t.title}`).toBeDefined();
      expect(got!.done).toBe(t.status === "done");
      expect(got!.dayNumber).toBe(t.dayNumber ?? null);
      expect(got!.weekNumber).toBe(t.weekNumber ?? null);
    }
  });
});

describe("splitTitleDay（标题里写着的日期）", () => {
  // 这是项目里的实际约定：模型把日期写在标题文字里，不填 dayNumber 字段。
  it("认出「第N天：」并去掉前缀", () => {
    expect(splitTitleDay("第1天：闭包（理解+手写累加器）")).toEqual({
      title: "闭包（理解+手写累加器）",
      dayNumber: 1,
      weekNumber: null,
    });
  });

  it("认得半角冒号、空格、粗体包裹", () => {
    expect(splitTitleDay("Day 2: 原型链").dayNumber).toBe(2);
    expect(splitTitleDay("**Day 3：** 事件循环").dayNumber).toBe(3);
    expect(splitTitleDay("第 4 天 ：Promise").dayNumber).toBe(4);
  });

  it("带周前缀时两周都取到", () => {
    expect(splitTitleDay("第2周 · 第5天：综合练习")).toEqual({
      title: "综合练习",
      dayNumber: 5,
      weekNumber: 2,
    });
  });

  it("不是日期的「第N…」不误伤", () => {
    // 章/节/题 都不是天
    expect(splitTitleDay("第1章：绪论").dayNumber).toBeNull();
    expect(splitTitleDay("第3题：手写Promise").dayNumber).toBeNull();
    // 无数字
    expect(splitTitleDay("第一天：开始").dayNumber).toBeNull();
    // 没有分隔符，可能只是标题的一部分
    expect(splitTitleDay("第1天回顾").dayNumber).toBeNull();
  });

  it("只有前缀没内容时保留原标题，不把标题清空", () => {
    expect(splitTitleDay("第1天：")).toEqual({
      title: "第1天：",
      dayNumber: 1,
      weekNumber: null,
    });
  });

  it("没有前缀时标题原样返回", () => {
    expect(splitTitleDay("拆解目标")).toEqual({
      title: "拆解目标",
      dayNumber: null,
      weekNumber: null,
    });
  });
});

describe("parseTaskSection：从标题取日期", () => {
  it("真实数据形状：平铺清单 + 标题里的「第N天：」", () => {
    // 这段就是库里「JS八股高频10题专项突破」的实际文档形状
    const doc = [
      "## 任务安排",
      "- [ ] 第1天：闭包（理解+手写累加器）",
      "- [ ] 第2天：原型链（理解+手写instanceof）",
      "- [ ] 第7天：复习总结 + 模拟面试自测",
    ].join("\n");

    expect(parseTaskSection(doc)).toEqual([
      { title: "闭包（理解+手写累加器）", done: false, dayNumber: 1, weekNumber: null },
      { title: "原型链（理解+手写instanceof）", done: false, dayNumber: 2, weekNumber: null },
      { title: "复习总结 + 模拟面试自测", done: false, dayNumber: 7, weekNumber: null },
    ]);
  });

  it("标题自带的日期优先于分组标题（它贴在这一条上，更具体）", () => {
    const doc = [
      "## 任务安排",
      "",
      "### Day 3",
      "",
      "- [ ] 第1天：标题说第1天",
      "- [ ] 没写日期的跟着分组走",
    ].join("\n");

    const items = parseTaskSection(doc);
    expect(items[0].dayNumber).toBe(1);
    expect(items[1].dayNumber).toBe(3);
  });
});

describe("syncTasksFromDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([] as never);
    mockCreate.mockResolvedValue({} as never);
    mockUpdate.mockResolvedValue({} as never);
  });

  it("文档新增的任务带上 dayNumber / weekNumber", async () => {
    const doc = ["## 任务安排", "", "### 第 2 周 · Day 5", "", "- [ ] 新任务"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    expect(r).toEqual({ created: 1, updated: 0 });
    const data = (mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.title).toBe("新任务");
    expect(data.dayNumber).toBe(5);
    expect(data.weekNumber).toBe(2);
  });

  it("⚠️ 库里标题带「第N天：」前缀时，必须更新而不是重复建任务", async () => {
    // 真实数据的形状就是这样：日期在标题里，dayNumber 是 null。
    // 解析会把标题去前缀成「闭包…」，所以匹配键两侧都必须去前缀——
    // 否则匹配不上已有行，会把 263 条任务全部重复创建一遍。
    mockFindMany.mockResolvedValue([
      {
        id: "t1",
        title: "第1天：闭包（理解+手写累加器）",
        status: "pending",
        dayNumber: null,
        weekNumber: null,
      },
    ] as never);

    const doc = ["## 任务安排", "- [ ] 第1天：闭包（理解+手写累加器）"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    expect(mockCreate).not.toHaveBeenCalled(); // ← 关键：不能造重复
    expect(r).toEqual({ created: 0, updated: 1 });

    const data = (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.title).toBe("闭包（理解+手写累加器）"); // 前缀顺手清掉
    expect(data.dayNumber).toBe(1);
  });

  it("已经清理过的标题再次同步 → 无变化（幂等）", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "t1",
        title: "闭包（理解+手写累加器）",
        status: "pending",
        dayNumber: 1,
        weekNumber: null,
      },
    ] as never);

    const doc = ["## 任务安排", "- [ ] 第1天：闭包（理解+手写累加器）"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    expect(r).toEqual({ created: 0, updated: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("文档里日期变了 → 更新已有任务的日期", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", title: "任务A", status: "pending", dayNumber: 1, weekNumber: 1 },
    ] as never);

    const doc = ["## 任务安排", "", "### Day 3", "", "- [ ] 任务A"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    expect(r).toEqual({ created: 0, updated: 1 });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { dayNumber: 3 },
    });
  });

  it("文档没分组时不清空已有日期（保守：没写 ≠ 想清空）", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", title: "任务A", status: "pending", dayNumber: 2, weekNumber: 1 },
    ] as never);

    const doc = ["## 任务安排", "", "- [ ] 任务A"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    // 勾选状态没变、日期不给覆盖 → 什么都不用写
    expect(r).toEqual({ created: 0, updated: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("勾选状态和日期同时变化 → 一次 update 写两样", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", title: "任务A", status: "pending", dayNumber: 1, weekNumber: null },
    ] as never);

    const doc = ["## 任务安排", "", "### Day 4", "", "- [x] 任务A"].join("\n");
    const r = await syncTasksFromDocument("p1", "u1", doc);

    expect(r).toEqual({ created: 0, updated: 1 });
    const data = (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("done");
    expect(data.dayNumber).toBe(4);
  });

  it("分组段落解析为空时的静默 early-return（回归护栏）", async () => {
    // 这条不是在测 bug，而是在钉住「空结果 = 什么都不做」这个契约：
    // 一旦解析器回归成读到 0 条，这里会通过而上面的分组用例会红，
    // 两者合起来才说明「0 条」是真空而不是解析失败。
    const r = await syncTasksFromDocument("p1", "u1", "# 计划\n\n没有任务段落\n");
    expect(r).toEqual({ created: 0, updated: 0 });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
