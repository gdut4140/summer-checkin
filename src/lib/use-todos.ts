"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { TodoInfo } from "@/types";

// localStorage 仅用于一次性迁移（把老数据播种进后端后立即清空），后端是唯一数据源。
const STORAGE_KEY = "rainforest-todos";

// ---- 工具 ----

function loadFromStorage(): TodoInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Array<Partial<TodoInfo>>;
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (todo): todo is Partial<TodoInfo> & { id: string; title: string } =>
          typeof todo.id === "string" && typeof todo.title === "string"
      )
      .map((todo) => ({
        id: todo.id,
        title: todo.title,
        completed: Boolean(todo.completed),
        createdAt: todo.createdAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ---- Hook ----

export function useTodos() {
  const [todos, setTodos] = useState<TodoInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 初始化：后端为唯一数据源；后端为空但有本地老数据时做一次性迁移
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadFromStorage();
      try {
        const data = await api<{ todos: TodoInfo[] }>("/api/todos");
        if (cancelled) return;
        if (data.todos.length === 0 && local.length > 0) {
          // 一次性迁移：把本地待办播种进后端（保留完成状态和原创建时间）
          const created = await Promise.all(
            local.map((t) =>
              api<{ todo: TodoInfo }>("/api/todos", {
                method: "POST",
                body: JSON.stringify({
                  title: t.title,
                  completed: t.completed,
                  createdAt: t.createdAt,
                }),
              })
            )
          );
          if (cancelled) return;
          setTodos(created.map((c) => c.todo));
        } else {
          setTodos(data.todos);
        }
      } catch {
        // 离线兜底：先用本地缓存显示
        setTodos(local);
      } finally {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addTodo = useCallback((title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const temp: TodoInfo = {
      id: uid(),
      title: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => [temp, ...prev]);
    api<{ todo: TodoInfo }>("/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: trimmed }),
    })
      .then(({ todo }) => {
        setTodos((prev) => prev.map((t) => (t.id === temp.id ? todo : t)));
      })
      .catch(() => {
        setTodos((prev) => prev.filter((t) => t.id !== temp.id));
        toast.error("添加待办失败，请重试");
      });
  }, []);

  const toggleTodo = useCallback(
    (id: string) => {
      const target = todos.find((t) => t.id === id);
      if (!target) return;
      const next = !target.completed;
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: next } : t))
      );
      api(`/api/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: next }),
      }).catch(() => {
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !next } : t))
        );
        toast.error("更新待办失败，请重试");
      });
    },
    [todos]
  );

  const updateTitle = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      const target = todos.find((t) => t.id === id);
      if (!trimmed || !target) return;
      const oldTitle = target.title;
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t))
      );
      api(`/api/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      }).catch(() => {
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: oldTitle } : t))
        );
        toast.error("修改待办失败，请重试");
      });
    },
    [todos]
  );

  const removeTodo = useCallback(
    (id: string) => {
      const index = todos.findIndex((t) => t.id === id);
      const target = todos[index];
      if (!target) return;
      setTodos((prev) => prev.filter((t) => t.id !== id));
      api(`/api/todos/${id}`, { method: "DELETE" }).catch(() => {
        setTodos((prev) => {
          const without = prev.filter((t) => t.id !== id);
          without.splice(Math.min(index, without.length), 0, target);
          return without;
        });
        toast.error("删除待办失败，请重试");
      });
    },
    [todos]
  );

  const clearCompleted = useCallback(() => {
    const done = todos.filter((t) => t.completed);
    if (done.length === 0) return;
    setTodos((prev) => prev.filter((t) => !t.completed));
    Promise.all(
      done.map((t) => api(`/api/todos/${t.id}`, { method: "DELETE" }))
    ).catch(() => {
      setTodos((prev) => [...prev, ...done]);
      toast.error("清除待办失败，请重试");
    });
  }, [todos]);

  return {
    todos,
    loaded,
    addTodo,
    toggleTodo,
    removeTodo,
    updateTitle,
    clearCompleted,
  };
}
