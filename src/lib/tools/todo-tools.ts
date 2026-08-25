// ============================================================
// 今日待办工具：让 AI 操作 Todo 表（后端为唯一数据源）
//
// 沿用 Agent Workflow 工具的模式（agent-tools.ts）：
//   tool() + inputSchema(zod) + safeExecute + 闭包注入 userId
// 写操作先校验归属（findFirst id+userId），并注明先调用 getMyTodos 拿 id
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeExecute } from "./utils";
import type { TodoInfo, TodosListData } from "@/types";

/** DB 行 → 共享 DTO（date → ISO） */
function formatTodo(t: { id: string; title: string; completed: boolean; createdAt: Date }): TodoInfo {
  return {
    id: t.id,
    title: t.title,
    completed: t.completed,
    createdAt: t.createdAt.toISOString(),
  };
}

export function createTodoTools(userId: string) {
  // ============================================================
  // Tool 1: 查看今日待办清单
  // ============================================================
  const getMyTodos = tool({
    description:
      "查询用户当前的今日待办清单（未完成在前、新的在前）。用户问'我今天有什么待办/待办清单/还剩哪些待办'时用。",

    inputSchema: z.object({}),

    execute: async () => {
      return safeExecute("getMyTodos", async (): Promise<TodosListData> => {
        console.log(`[getMyTodos] 查询用户 ${userId} 的待办`);

        const todos = await prisma.todo.findMany({
          where: { userId },
          orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
        });

        if (todos.length === 0) {
          return {
            success: true,
            count: 0,
            todos: [],
            message: "今天还没有待办，要不要加一条？",
          };
        }

        return {
          success: true,
          count: todos.length,
          todos: todos.map(formatTodo),
        };
      });
    },
  });

  // ============================================================
  // Tool 2: 新增待办
  // ============================================================
  const createTodo = tool({
    description:
      "新增一条今日待办。用户说'帮我把X加入待办/记一下X/今天要做X'时用。只需传标题。",

    inputSchema: z.object({
      title: z.string().describe("待办标题，简洁明确，如'读第三章'"),
    }),

    execute: async ({ title }) => {
      return safeExecute("createTodo", async () => {
        console.log(`[createTodo] 用户 ${userId} 新增待办: ${title}`);

        const t = await prisma.todo.create({
          data: { userId, title: title.trim() },
        });

        console.log(`[createTodo] ✅ 新增成功: ${t.id}`);
        return {
          success: true as const,
          message: `已把「${t.title}」加入今日待办`,
          todo: formatTodo(t),
        };
      });
    },
  });

  // ============================================================
  // Tool 3: 更新待办（勾选完成/取消 + 修改标题）
  // ============================================================
  const updateTodo = tool({
    description:
      "更新一条今日待办：勾选完成/取消，或修改标题。至少提供 title 或 completed 之一。" +
      "先通过 getMyTodos 拿到待办 id。",

    inputSchema: z.object({
      id: z.string().describe("待办ID，先通过 getMyTodos 获取"),
      title: z.string().optional().describe("新的待办标题"),
      completed: z.boolean().optional().describe("true=已完成，false=重新打开"),
    }),

    execute: async ({ id, title, completed }) => {
      return safeExecute("updateTodo", async () => {
        console.log(`[updateTodo] 待办 ${id} → ${title ?? "-"} / completed=${completed ?? "-"}`);

        // 校验归属
        const existing = await prisma.todo.findFirst({ where: { id, userId } });
        if (!existing) {
          throw new Error(`待办不存在: ${id}`);
        }
        if (title === undefined && completed === undefined) {
          throw new Error("请至少提供 title 或 completed 之一");
        }

        const data: { title?: string; completed?: boolean } = {};
        if (title !== undefined) data.title = title.trim();
        if (completed !== undefined) data.completed = completed;

        const t = await prisma.todo.update({ where: { id }, data });

        const msg =
          completed === true
            ? `已勾选「${t.title}」`
            : completed === false
              ? `已重新打开「${t.title}」`
              : `已把待办改为「${t.title}」`;

        console.log(`[updateTodo] ✅ ${msg}`);
        return {
          success: true as const,
          message: msg,
          todo: formatTodo(t),
        };
      });
    },
  });

  // ============================================================
  // Tool 4: 删除待办
  // ============================================================
  const deleteTodo = tool({
    description:
      "删除一条今日待办。用户说'删掉待办X/划掉不要了'时用。先通过 getMyTodos 拿到待办 id。",

    inputSchema: z.object({
      id: z.string().describe("待办ID，先通过 getMyTodos 获取"),
    }),

    execute: async ({ id }) => {
      return safeExecute("deleteTodo", async () => {
        console.log(`[deleteTodo] 删除待办 ${id}`);

        const r = await prisma.todo.deleteMany({ where: { id, userId } });
        if (!r.count) {
          throw new Error(`待办不存在: ${id}`);
        }

        console.log(`[deleteTodo] ✅ 已删除`);
        return {
          success: true as const,
          message: "已删除这条待办",
        };
      });
    },
  });

  return {
    getMyTodos,
    createTodo,
    updateTodo,
    deleteTodo,
  };
}
