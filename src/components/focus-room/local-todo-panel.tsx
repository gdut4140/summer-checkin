"use client";

import { useState } from "react";
import { Plus, Trash, Check, Circle } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useLocalTodos } from "@/lib/use-local-todos";

export function LocalTodoPanel() {
  const { todos, loaded, addTodo, toggleTodo, removeTodo, clearCompleted } =
    useLocalTodos();
  const [value, setValue] = useState("");

  if (!loaded) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const active = todos.filter((t) => !t.completed);
  const done = todos.filter((t) => t.completed);

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    addTodo(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-lg border border-white/[0.06]">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">今日待办</h3>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
            {active.length} 项
          </span>
        </div>
        {done.length > 0 && (
          <button
            onClick={clearCompleted}
            className="text-xs text-muted-foreground hover:text-white/70 transition-colors"
          >
            清除已完成
          </button>
        )}
      </div>

      {/* 输入框 */}
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="添加待办…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!value.trim()}
          className="shrink-0 rounded-lg p-1.5 text-primary hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          <Plus className="h-4 w-4" weight="bold" />
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <AnimatePresence>
          {todos.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              还没有待办，添加一个吧
            </p>
          )}

          {[...active, ...done].map((todo) => (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
              >
                {todo.completed ? (
                  <Check className="h-4 w-4 text-primary" weight="bold" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>

              <span
                className={`flex-1 text-sm ${
                  todo.completed
                    ? "text-muted-foreground/50 line-through"
                    : "text-foreground"
                }`}
              >
                {todo.title}
              </span>

              <button
                onClick={() => removeTodo(todo.id)}
                className="shrink-0 rounded p-1 text-muted-foreground/30 opacity-0 hover:text-red-400 hover:opacity-100 group-hover:opacity-100 transition-all"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
