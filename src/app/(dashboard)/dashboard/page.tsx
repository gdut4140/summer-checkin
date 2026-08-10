import { requireAuth } from "@/lib/auth-utils";
import { PomodoroStation } from "@/components/focus-room/pomodoro-station";
import { LocalTodoPanel } from "@/components/focus-room/local-todo-panel";

export default async function DashboardPage() {
  await requireAuth();

  return (
    <div className="flex flex-1 flex-col px-6 pt-8">
      {/* 标题 */}
      <header className="product-header shrink-0">
        <div>
          <p className="product-eyebrow">Deep focus</p>
          <h1 className="product-title">雨林自习室</h1>
          <p className="product-subtitle">
            在雨声中沉浸，让每一段专注都有节奏。
          </p>
        </div>
      </header>

      {/* 三栏：番茄钟 | 雨景 | 待办 */}
      <div className="flex flex-1 items-center gap-0">
        {/* 左：番茄钟 */}
        <div className="flex w-1/4 shrink-0 items-center px-2">
          <PomodoroStation />
        </div>

        {/* 中：留白看雨 */}
        <div className="flex-1" />

        {/* 右：待办 */}
        <div className="w-1/4 shrink-0 px-2">
          <LocalTodoPanel />
        </div>
      </div>
    </div>
  );
}
