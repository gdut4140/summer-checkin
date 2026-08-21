// ============================================================
// Day 10 优化：统一类型定义
// ① ToolResult<T>   — Tool execute() 返回值（判别联合）
// ② ActionResult<T> — Server Action 返回值（判别联合）
// ③ Tool 专用类型    — PlanInfo / CheckinInfo / 各 Tool 返回体
// ============================================================

// ---- Tool 返回值类型 ----
export interface ToolSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ToolError {
  success: false;
  error: string;
}

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolError;

// ---- Server Action 返回值类型 ----
export interface ActionSuccess<T = void> {
  success: true;
  data?: T;
}

export interface ActionError {
  success: false;
  error: string;
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionError;

// ---- Tool 专用数据类型 ----
export interface PlanInfo {
  id: string;
  name: string;
  goal: string | null;
  progress?: number;
  status?: string;
}

export interface CheckinInfo {
  content: string;
  hours: number;
  subject: string | null;
  mood: string | null;
  planName: string | null;
  date: string;
}

export interface CreatePlanData {
  success: true;
  message: string;
  plan: PlanInfo;
}

export interface PlansListData {
  success: true;
  count: number;
  plans: PlanInfo[];
  message?: string;
}

export interface CheckinsListData {
  success: true;
  count: number;
  checkins: CheckinInfo[];
  totalHours: number;
  subjects?: string[];
}

// ---- 页面/组件类型 ----
export interface PlanWithProgress {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  startDate: Date | null;
  status: string;
  createdAt: Date;
  totalTasks: number;
  completedTasks: number;
  progress: number;
}

export interface CheckinWithPlan {
  id: string;
  content: string;
  hours: number;
  subject: string | null;
  mood: string | null;
  checkinDate: Date;
  planName?: string | null;
}

export interface DashboardStats {
  streak: number;
  todayHours: number;
  weekCompletion: number;
  recentCheckins: CheckinWithPlan[];
  weeklyData: { date: string; hours: number }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

// ============================================================
// Day 22 Agent Workflow: PlanTask 类型定义
// ============================================================
export type TaskStatus = "pending" | "in_progress" | "done" | "skipped";
export type TaskPriority = "high" | "normal" | "low";
export type TaskCategory = "study" | "project" | "review" | "exercise";

export interface PlanTaskInfo {
  id: string;
  planId: string;
  title: string;
  description: string | null;
  dayNumber: number | null;
  weekNumber: number | null;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  completedAt: string | null;
  createdAt: string;
}

export interface PlanTasksListData {
  success: true;
  planId: string;
  planName: string;
  tasks: PlanTaskInfo[];
  stats: {
    total: number;
    done: number;
    inProgress: number;
    pending: number;
    skipped: number;
    progress: number; // 0-100
  };
}

export interface TodayTasksData {
  success: true;
  tasks: PlanTaskInfo[];
  activePlans: { planId: string; planName: string; taskCount: number }[];
}

export interface BreakdownTasksResult {
  success: true;
  planId: string;
  planName: string;
  tasksCreated: number;
  message: string;
  tasks: PlanTaskInfo[];
}

// ============================================================
// Phase 2: Memory + AgentDecision 类型
// ============================================================

/** 记忆类型 */
export type MemoryType =
  | "goal"
  | "habit"
  | "preference"
  | "skill"
  | "weakness"
  | "fact";

export interface MemoryInfo {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  confidence: number;
  lastUsed: string | null;
  createdAt: string;
}

/** Agent 决策类型 */
export type DecisionType = "PLAN_ADJUST" | "REMINDER" | "ANALYSIS" | "TASK_CREATE";
export type DecisionStatus = "executed" | "pending" | "rejected" | "failed";

export interface DecisionInfo {
  id: string;
  userId: string;
  runId: string | null;
  type: DecisionType;
  reason: string;
  action: Record<string, unknown>;
  status: DecisionStatus;
  feedback: string | null;
  createdAt: string;
}

export interface DecisionStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recentRate: number;
}

// ============================================================
// Phase 3: Notification + Report + Schedule 类型
// ============================================================

export type NotificationType =
  | "reminder"
  | "analysis"
  | "report"
  | "encouragement"
  | "system";

export interface NotificationInfo {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

export interface DailyReport {
  userId: string;
  date: string;
  status: "on_track" | "need_attention" | "need_adjustment" | "at_risk";
  summary: string;
  stats: {
    todayHours: number;
    weekHours: number;
    streak: number;
    completionRate: number;
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  generatedBy: string | null; // AgentRun ID
}

export type ScheduleType = "daily_review" | "weekly_analysis" | "plan_adjust";

export interface ScheduleInfo {
  id: string;
  userId: string;
  type: ScheduleType;
  cron: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}
