import { describe, expect, it } from "vitest";
import {
  buildChatContext,
  buildTriggerPrompt,
  type ChatHistoryRow,
} from "../server/chat-context";

// 真实故障：温柔宝把嘴欠宝说的话当成自己说的。
// 原因不是模型笨，而是上下文里两个 AI 的历史都以 assistant 角色出现——
// assistant 的语义就是「模型自己的回复」，只靠 name 字段区分不可靠。
// 这里锁住的规则：对当前 AI 来说，只有它自己的历史是 assistant。

function row(
  id: string,
  role: "user" | "assistant",
  content: string,
  aiRole: string | null = null,
  name: string | null = "用户"
): ChatHistoryRow {
  return { id, role, content, aiRole, user: { name } };
}

const history: ChatHistoryRow[] = [
  row("m1", "user", "大家好", null, "小明"),
  row("m2", "assistant", "你好呀", "gentle", "温柔宝"),
  row("m3", "assistant", "切", "snarky", "嘴欠宝"),
  row("m4", "user", "@温柔宝 在吗", null, "小红"),
];

describe("buildChatContext", () => {
  it("温柔宝视角：自己的历史是 assistant，嘴欠宝的话是带名字的 user", () => {
    const context = buildChatContext(history, "gentle");

    expect(context).toEqual([
      { role: "user", content: "【小明】大家好" },
      { role: "assistant", content: "你好呀" },
      { role: "user", content: "【嘴欠宝】切" },
      { role: "user", content: "【小红】@温柔宝 在吗" },
    ]);
  });

  it("嘴欠宝视角：反过来，温柔宝的话不能是 assistant", () => {
    const context = buildChatContext(history, "snarky");

    expect(context[1]).toEqual({ role: "user", content: "【温柔宝】你好呀" });
    expect(context[2]).toEqual({ role: "assistant", content: "切" });
  });

  it("只允许当前 AI 自己的消息是 assistant（核心回归）", () => {
    for (const self of ["gentle", "snarky"] as const) {
      const context = buildChatContext(history, self);
      const assistantRows = context.filter((m) => m.role === "assistant");
      // 历史里只有两条 AI 消息，其中只有属于 self 的那一条能是 assistant
      expect(assistantRows).toHaveLength(1);
      expect(assistantRows[0].content).toBe(
        self === "gentle" ? "你好呀" : "切"
      );
    }
  });

  it("排除本次触发消息，避免同一句话在上下文里出现两次", () => {
    const context = buildChatContext(history, "gentle", "m4");
    expect(context.some((m) => m.content.includes("@温柔宝 在吗"))).toBe(false);
    expect(context).toHaveLength(3);
  });

  it("保持时间正序", () => {
    const context = buildChatContext(history, "gentle");
    expect(context.map((m) => m.content)).toEqual([
      "【小明】大家好",
      "你好呀",
      "【嘴欠宝】切",
      "【小红】@温柔宝 在吗",
    ]);
  });

  it("旧数据 aiRole 为空时按另一个群友处理，不能当成自己", () => {
    const legacy = [row("old", "assistant", "以前的回复", null, "温柔宝")];
    expect(buildChatContext(legacy, "gentle")[0]).toEqual({
      role: "user",
      content: "【嘴欠宝】以前的回复",
    });
  });

  it("用户名为空 → 匿名用户", () => {
    const context = buildChatContext(
      [row("x", "user", "嗨", null, null)],
      "gentle"
    );
    expect(context[0]).toEqual({ role: "user", content: "【匿名用户】嗨" });
  });
});

describe("buildTriggerPrompt", () => {
  it("普通 @ 必须带上发送者名字（否则模型不知道是谁在叫它）", () => {
    expect(buildTriggerPrompt("在吗", "小明")).toBe("【小明】@了你：在吗");
  });

  it("没有发送者名字 → 用「有人」兜底，但仍保留标签结构", () => {
    expect(buildTriggerPrompt("在吗")).toBe("【有人】@了你：在吗");
  });

  it("引用回复 → 同时写明转发者和原作者", () => {
    const text = buildTriggerPrompt("你怎么看", "小明", {
      userName: "小红",
      content: "原消息",
    });
    expect(text).toContain("【小明】@了你");
    expect(text).toContain("转给你一条【小红】发的消息");
    expect(text).toContain("> 原消息");
    expect(text).toContain("这条消息是【小红】发的");
  });

  it("超长引用截断到 400 字 + 省略号", () => {
    const text = buildTriggerPrompt("q", "小明", {
      userName: "小红",
      content: "字".repeat(500),
    });
    const quoted = text.split("\n")[1].slice(2);
    expect(quoted).toHaveLength(401);
    expect(quoted.endsWith("…")).toBe(true);
  });

  it("转发者 / 原作者缺失时给出兜底称呼", () => {
    const text = buildTriggerPrompt("q", undefined, {
      userName: null,
      content: "原消息",
    });
    expect(text).toContain("【有人】@了你");
    expect(text).toContain("【用户】");
  });
});
