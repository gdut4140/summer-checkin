"use client";

import { useState } from "react";
import { Check, ListChecks, PencilSimple, Plus, Sparkle, Trash } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useLocalTodos, type LocalTodo } from "@/lib/use-local-todos";
import { cn } from "@/lib/utils";

export function LocalTodoPanel() {
  const { todos, loaded, addTodo, toggleTodo, removeTodo, updateTitle } = useLocalTodos();
  const [value, setValue] = useState("");

  if (!loaded) {
    return (
      <div className="flex h-[520px] max-h-[62dvh] w-full items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
    );
  }

  const active = todos.filter((todo) => !todo.completed);
  const done = todos.filter((todo) => todo.completed);
  // 任务并列：保持添加顺序，未完成在前、已完成在后
  const orderedTodos = [...active, ...done];

  const total = todos.length;
  const completedCount = done.length;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    addTodo(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <section className="relative flex h-[520px] max-h-[62dvh] w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[color-mix(in_srgb,var(--theme-background)_58%,transparent)] shadow-[0_18px_55px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/[0.055] to-transparent" />

      {/* 标题与进度 */}
      <header className="relative flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
            <ListChecks className="size-4" weight="duotone" />
          </div>
          <div className="min-w-0 leading-tight">
            <h3 className="truncate text-[13px] font-semibold text-foreground">今日待办</h3>
            <p className="mt-1 text-[10px] text-muted-foreground/65">
              {total === 0 ? "从一件小事开始" : active.length > 0 ? `${active.length} 件等待完成` : "清单已经完成"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-sm font-semibold text-foreground/80">{completedCount}</span>
          <span className="text-[10px] text-muted-foreground/45">/ {total}</span>
        </div>
      </header>

      <div className="mx-4 h-px overflow-hidden bg-white/[0.07]">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 180, damping: 28 }}
        />
      </div>

      {/* 快速添加 */}
      <div className="px-3 pb-2 pt-3">
        <div className="group flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/[0.08] px-3 transition-colors focus-within:border-primary/30 focus-within:bg-black/[0.12]">
          <Plus className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-focus-within:text-primary" weight="bold" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="添加一件要做的事"
            aria-label="添加待办"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/35"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!value.trim()}
            aria-label="添加到清单"
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:scale-90 disabled:opacity-0"
          >
            <Check className="size-3.5" weight="bold" />
          </button>
        </div>
      </div>

      {/* 单一清单：完成项自然移动到队尾 */}
      <div className="theme-scrollbar thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
        <AnimatePresence mode="popLayout">
          {total === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex h-full min-h-44 flex-col items-center justify-center px-5 text-center"
            >
              <div className="relative flex size-11 items-center justify-center text-primary/55">
                <span className="absolute inset-0 rounded-full border border-primary/10" />
                <Sparkle className="size-5" weight="duotone" />
              </div>
              <p className="mt-3 text-xs font-medium text-foreground/65">留一点空间给今天</p>
              <p className="mt-1 text-[10px] leading-5 text-muted-foreground/40">写下一件事，然后专心完成它</p>
            </motion.div>
          )}

          {orderedTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleTodo(todo.id)}
              onRemove={() => removeTodo(todo.id)}
              onUpdateTitle={(title) => updateTitle(todo.id, title)}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function TodoItem({
  todo,
  onToggle,
  onRemove,
  onUpdateTitle,
}: {
  todo: LocalTodo;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateTitle: (title: string) => void;
}) {
  const completed = todo.completed;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEdit = () => {
    setEditValue(todo.title);
    setEditing(true);
  };
  const saveEdit = () => {
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== todo.title) onUpdateTitle(trimmed);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditValue(todo.title);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -5, scale: 0.985 }}
      animate={{ opacity: completed ? 0.9 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.97 }}
      transition={{
        layout: { type: "spring", stiffness: 420, damping: 36 },
        opacity: { duration: 0.18 },
        scale: { duration: 0.18 },
      }}
      role="checkbox"
      aria-checked={completed}
      tabIndex={editing ? -1 : 0}
      onClick={editing ? undefined : onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (editing) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group mb-0.5 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none transition-colors",
        "hover:bg-white/[0.045] focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-primary/25"
      )}
    >
      {editing ? (
        // 编辑态：直接改标题
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          onBlur={saveEdit}
          aria-label={`编辑待办：${todo.title}`}
          className="min-w-0 flex-1 rounded-md border border-primary/30 bg-black/[0.12] px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50"
        />
      ) : (
        <>
          {/* 勾选 */}
          <span className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border transition-all",
            completed
              ? "border-primary bg-primary text-primary-foreground shadow-[0_0_7px_color-mix(in_srgb,var(--theme-primary)_50%,transparent)]"
              : "border-muted-foreground/35 text-transparent group-hover:border-primary/65"
          )}>
            {completed ? (
              <Check className="size-3" weight="bold" />
            ) : null}
          </span>

          {/* 标题 */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs leading-5",
              completed ? "text-muted-foreground/45 line-through" : "text-foreground/82"
            )}
          >
            {todo.title}
          </span>

          {/* 编辑 */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              startEdit();
            }}
            aria-label={`编辑待办：${todo.title}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/20 opacity-0 transition-all hover:bg-white/[0.05] hover:text-foreground/60 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <PencilSimple className="size-3" />
          </button>

          {/* 删除 */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={`删除待办：${todo.title}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/20 opacity-0 transition-all hover:bg-white/[0.05] hover:text-foreground/60 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash className="size-3" />
          </button>
        </>
      )}
    </motion.div>
  );
}
