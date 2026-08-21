"use client";

import { useState, useCallback, useEffect } from "react";

// ---- 类型 ----

export interface LocalTodo {
  id: string;
  title: string;
  completed: boolean;
  planName?: string;
  createdAt: string; // ISO
}

const STORAGE_KEY = "rainforest-todos";

// ---- 工具 ----

function loadFromStorage(): LocalTodo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Array<Partial<LocalTodo>>;
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((todo): todo is Partial<LocalTodo> & { id: string; title: string } =>
        typeof todo.id === "string" && typeof todo.title === "string"
      )
      .map((todo) => ({
        id: todo.id,
        title: todo.title,
        completed: Boolean(todo.completed),
        planName: todo.planName,
        createdAt: todo.createdAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveToStorage(todos: LocalTodo[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Hook ----

let _syncing = false;
let _pendingSync: LocalTodo[] | null = null;

export function useLocalTodos() {
  const [todos, setTodos] = useState<LocalTodo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 初始化加载
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTodos(loadFromStorage());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 变更时持久化 + 后台同步
  const persist = useCallback((next: LocalTodo[]) => {
    setTodos(next);
    saveToStorage(next);
    // 后台静默同步（不阻塞 UI）
    syncToBackend(next);
  }, []);

  const addTodo = useCallback(
    (title: string, options?: { planName?: string }) => {
      const todo: LocalTodo = {
        id: uid(),
        title: title.trim(),
        completed: false,
        planName: options?.planName,
        createdAt: new Date().toISOString(),
      };
      persist([todo, ...todos]);
    },
    [todos, persist]
  );

  const toggleTodo = useCallback(
    (id: string) => {
      const next = todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      );
      persist(next);
    },
    [todos, persist]
  );

  const removeTodo = useCallback(
    (id: string) => {
      persist(todos.filter((t) => t.id !== id));
    },
    [todos, persist]
  );

  const updateTitle = useCallback(
    (id: string, title: string) => {
      const next = todos.map((t) =>
        t.id === id ? { ...t, title: title.trim() } : t
      );
      persist(next);
    },
    [todos, persist]
  );

  const clearCompleted = useCallback(() => {
    persist(todos.filter((t) => !t.completed));
  }, [todos, persist]);

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

// ---- 后台同步（fire-and-forget）----

async function syncToBackend(todos: LocalTodo[]) {
  _pendingSync = todos;
  if (_syncing) return;
  _syncing = true;
  try {
    while (_pendingSync) {
      const next = _pendingSync;
      _pendingSync = null;
      await fetch("/api/todos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: next }),
      });
    }
  } catch {
    // 静默失败，下次变更时重试
  } finally {
    _syncing = false;
  }
}
