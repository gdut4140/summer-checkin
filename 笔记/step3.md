# Step 3: Phase 3 — 主动任务系统（Cron + 通知 + 报告）

## 概述

Phase 3 的核心目标：让 AI Agent 从"被动响应"升级为"主动管理"。

之前的 Phase 1 和 Phase 2 已经实现了 Agent Runtime（观察→分析→规划→执行）和 Memory 升级。但 Agent 的运行是"谁触发谁运行"——用户打开页面时手动触发，或者外部 cron 服务每天调一次。

Phase 3 要做什么：
- **Cron 定时任务**：让 Agent 每天自动运行，不需要用户操作
- **通知系统**：Agent 的分析结果和提醒真正推送给用户（新增 Notification 模型）
- **自动报告**：每日学习简报自动生成并存储
- **用户级调度**：每个用户可以有独立的调度配置（AgentSchedule 模型）

---

## 一、数据库升级

### 1.1 新增 Notification 模型

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   @default("reminder")  // reminder | analysis | report | encouragement | system
  title     String
  content   String   @db.Text
  read      Boolean  @default(false)
  actionUrl String?                        // 点击通知跳转到哪个页面
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read, createdAt])
  @@index([userId, type])
  @@map("notification")
}
```

**设计要点：**
- `type` 字段区分通知类型：提醒(reminder)、分析(analysis)、报告(report)、鼓励(encouragement)、系统(system)
- `read` 布尔值标记已读/未读
- `actionUrl` 可选——点击通知可以跳转到具体页面（如 `/agent`、`/checkin`）
- 复合索引 `[userId, read, createdAt]` 优化"获取用户未读通知列表"的查询

### 1.2 新增 AgentSchedule 模型

```prisma
model AgentSchedule {
  id        String   @id @default(cuid())
  userId    String
  type      String   @default("daily_review")  // daily_review | weekly_analysis | plan_adjust
  cron      String   @default("0 9 * * *")     // 标准 5 字段 cron 表达式
  enabled   Boolean  @default(true)
  lastRunAt DateTime?
  nextRunAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type])   // 每个用户每种类型只能有一个调度配置
  @@index([enabled, nextRunAt])  // 优化：查找需要运行的用户
  @@map("agentschedule")
}
```

**设计要点：**
- `@@unique([userId, type])` — 每个用户对"每日回顾"只能有一个配置，避免重复
- `cron` 字段存储标准 cron 表达式，灵活支持各种调度
- `lastRunAt` / `nextRunAt` 记录上次运行时间和下次计划运行时间
- 索引 `[enabled, nextRunAt]` 让 cron job 可以高效查找"当前应该运行"的用户

### 1.3 为什么不需要"Report"模型

报告中提到可能需要一个 DailyReport 模型。实际上，报告内容已经可以通过两种方式持久化：
1. **AgentRun + AgentDecision**：每次 Agent 运行都会记录分析结果
2. **Notification (type="report")**：生成的报告以通知形式存储，用户可以直接查看

这样避免了模型冗余——报告本质上就是"一种特殊格式的通知"。

---

## 二、通知服务

### 2.1 架构

新建 `src/lib/notification.ts`，提供完整的 CRUD 操作。

**核心函数：**

| 函数 | 用途 |
|---|---|
| `createNotification(input)` | Agent 生成一条通知 |
| `listNotifications(userId, options)` | 分页查询通知（支持类型/已读过滤） |
| `getUnreadCount(userId)` | 获取未读数（前端 badge） |
| `markAsRead(id, userId)` | 标记单条已读 |
| `markAllAsRead(userId)` | 全部标记已读 |
| `deleteNotification(id, userId)` | 删除单条 |
| `cleanupOldNotifications(userId, days)` | 清理旧已读通知 |

### 2.2 关键设计决策

**为什么用 `NotificationType` 联合类型而不是 `string`？**

```typescript
export type NotificationType =
  | "reminder"      // 学习提醒
  | "analysis"      // 分析结果
  | "report"        // 报告推送
  | "encouragement" // 鼓励
  | "system";       // 系统通知
```

TypeScript 的联合类型提供了编译时的类型安全——前端渲染时可以根据 type 选择不同的 UI 组件（提醒用铃铛图标，报告用文档图标，等等）。

### 2.3 模式：遵循项目约定

查看 `src/lib/memory.ts` 和 `src/lib/agent/service.ts`，项目中的服务模块都遵循相同的模式：
1. 直接导入 `prisma` 单例（`@/lib/prisma`）
2. 函数签名使用 `export async function`
3. 错误处理用 try-catch + console.error
4. 返回类型使用 interface

`notification.ts` 完全遵循了这个模式。

---

## 三、报告生成器

### 3.1 架构

新建 `src/lib/agent/report.ts`。

两个主要函数：
- `generateDailyReport` — 生成每日学习简报
- `formatReportAsMarkdown` — 将报告格式化为 Markdown

### 3.2 report 数据流

```
LearningContext (observe 阶段)
    +
AgentAnalysis (analyze 阶段)
    +
StudyPattern (analyzeStudyPattern 工具)
    |
    v
generateDailyReport()
    |
    v
DailyReport { status, summary, stats, strengths, weaknesses, suggestions }
    |
    v
formatReportAsMarkdown()
    |
    v
Notification (type="report", content=Markdown 文本)
```

### 3.3 DailyReport 数据结构

```typescript
interface DailyReport {
  userId: string;
  date: string;              // ISO 日期
  status: "on_track" | "need_attention" | "need_adjustment" | "at_risk";
  summary: string;           // 一句话总结
  stats: {
    todayHours: number;
    weekHours: number;
    streak: number;
    completionRate: number;
  };
  strengths: string[];       // 强项科目
  weaknesses: string[];      // 弱项科目
  suggestions: string[];     // 改进建议
  generatedBy: string | null; // 关联的 AgentRun ID
}
```

### 3.4 Markdown 渲染

`formatReportAsMarkdown` 将结构化报告转换为可读的 Markdown：
- 根据 status 选择 emoji（✅/⚠️/🔧/🚨）
- 四个 section：概览、今日数据、强项/弱项、建议
- 底部标注"由 Summer AI Learning Coach 自动生成"

---

## 四、升级 executeAction（核心改动）

### 4.1 之前的状态

Phase 1 的 `executeAction` 只有占位实现：

```typescript
case "SEND_REMINDER":
  console.log("生成提醒:", action.detail);  // 只打日志！
  return { success: true };

case "GENERATE_REPORT":
  return { success: true };  // 什么都不做！
```

### 4.2 Phase 3 升级

```typescript
case "SEND_REMINDER":
  // 创建真实的 Notification 记录
  await createNotification({
    userId,
    type: "reminder",
    title: "⏰ 学习提醒",
    content: action.detail,
    actionUrl: "/checkin",
  });

case "GENERATE_REPORT":
  // 生成结构化日报并保存为通知
  const report = generateDailyReport({ userId, context, analysis });
  const markdown = formatReportAsMarkdown(report);
  await createNotification({
    userId,
    type: "report",
    title: `📊 学习日报 — ${report.date}`,
    content: markdown,
    actionUrl: "/agent",
  });

case "CREATE_TASK":
  // 自动创建任务到用户的第一个活跃计划
  const activePlan = await prisma.plan.findFirst({
    where: { userId, status: "active" },
  });
  const task = await prisma.planTask.create({ ... });

case "ADJUST_PLAN":
  // 创建通知提醒用户确认计划调整
  await createNotification({
    userId,
    type: "analysis",
    title: "🔧 计划调整建议",
    content: action.detail,
    actionUrl: "/agent",
  });
```

### 4.3 为什么 executeAction 需要额外参数

之前签名：`executeAction(userId, action)`

现在签名：`executeAction(userId, action, context?, analysis?)`

`context` 和 `analysis` 是可选参数——只有在 `runLearningAgent` 内部调用时才会传入（此时 context 和 analysis 可用）。外部调用（如直接调用 executeAction）不会传这两个参数，此时 GENERATE_REPORT 会降级为简单通知。

---

## 五、Cron Job 升级

### 5.1 之前（Phase 1）

```
找有活跃计划的用户 → 逐个运行 runLearningAgent → 返回结果
```

### 5.2 Phase 3 升级

```
┌─────────────────────────────────────────────────────────┐
│  GET /api/agent/cron/daily                               │
│                                                          │
│  1. 查找需要运行的用户                                      │
│     ├── AgentSchedule 优先（查 cron 匹配 + enabled=true）    │
│     └── 回退：活跃计划用户（Phase 1 策略）                    │
│                                                          │
│  2. 为每个用户运行 Agent                                    │
│     └── runLearningAgent(userId, { mode: "daily" })       │
│         └── executeAction 自动创建 Notification             │
│                                                          │
│  3. 更新 AgentSchedule.lastRunAt / nextRunAt              │
│                                                          │
│  4. 周日特殊处理：生成周报                                    │
│                                                          │
│  5. 清理：删除 30 天前已读通知                                │
└─────────────────────────────────────────────────────────┘
```

### 5.3 AgentSchedule 调度策略

```typescript
// 匹配当前时间的调度配置
const timePattern = `${minute} ${hour} * * *`;
const scheduledUsers = await prisma.agentSchedule.findMany({
  where: {
    enabled: true,
    OR: [
      { cron: timePattern },              // 精确匹配
      { cron: { startsWith: `* ${hour}` } }, // 宽松匹配（每小时）
    ],
  },
});
```

**回退机制**：如果没有任何 AgentSchedule 配置，自动回退到 Phase 1 策略（查找有活跃计划的用户），确保兼容性。

### 5.4 为什么不在 cron 中直接生成报告

Agent 在运行过程中已经调用了 `executeAction` → `GENERATE_REPORT`，会自动生成通知。Cron 的职责是触发运行，而不是重复生成。只有在周日生成周报时，cron 才会额外创建通知。

---

## 六、通知 API 路由

### 6.1 路由结构

```
GET    /api/notifications       — 获取通知列表（分页、过滤）
POST   /api/notifications       — 标记全部已读 (body: { action: "markAllRead" })
PATCH  /api/notifications/[id]  — 标记单条已读 (body: { read: true })
DELETE /api/notifications/[id]  — 删除单条通知
```

### 6.2 API 响应格式

```json
// GET /api/notifications?unreadOnly=true&limit=20
{
  "notifications": [
    {
      "id": "...",
      "type": "reminder",
      "title": "⏰ 学习提醒",
      "content": "今天还有算法任务未完成",
      "read": false,
      "actionUrl": "/checkin",
      "createdAt": "2026-08-02T09:00:00.000Z"
    }
  ],
  "total": 15,
  "unreadCount": 3,
  "hasMore": false
}
```

### 6.3 认证

所有通知 API 都需要用户登录（通过 `getAuthUser()` 验证 Session）。每个操作都会验证通知所有权。

---

## 七、类型导出

### 7.1 新增到 `src/types/index.ts`

```typescript
export type NotificationType = "reminder" | "analysis" | "report" | "encouragement" | "system";
export interface NotificationInfo { ... }
export interface DailyReport { ... }
export type ScheduleType = "daily_review" | "weekly_analysis" | "plan_adjust";
export interface ScheduleInfo { ... }
```

### 7.2 新增到 `src/lib/agent/index.ts`

```typescript
// Phase 3: Report generation
export { generateDailyReport, generateWeeklyReport, formatReportAsMarkdown } from "./report";
```

---

## 八、验证与测试

### 8.1 Prisma Schema 验证

```bash
npx prisma db push
# → Your database is now in sync with your Prisma schema. Done in 2.58s ✅
```

### 8.2 TypeScript 编译

```bash
npx tsc --noEmit
# 只有 7 个预存错误（与本次改动无关），新增代码 0 错误 ✅
```

### 8.3 服务器运行

```bash
npx next dev
# 服务器正常启动，页面正常渲染 ✅
```

### 8.4 如何手动测试

1. **测试通知 API**：
   - 登录后访问 `GET /api/notifications`，应该返回空列表
   - 访问 `POST /api/notifications` body `{ "action": "markAllRead" }`，应该返回 `markedRead: 0`

2. **测试 Cron Job**：
   ```bash
   # 不设置 CRON_SECRET 时无需认证
   curl -X GET http://localhost:3000/api/agent/cron/daily
   ```
   注意：如果 auth middleware 拦截了请求，可能需要在浏览器中登录后，从控制台 fetch：
   ```javascript
   fetch("/api/agent/cron/daily").then(r => r.json()).then(console.log)
   ```

3. **测试通知生成**：
   在 Agent Center 触发一次 Agent 运行，检查数据库中是否有新通知：
   ```sql
   SELECT * FROM notification ORDER BY createdAt DESC LIMIT 10;
   ```

4. **验证数据库模型**：
   ```sql
   DESCRIBE notification;
   DESCRIBE agentschedule;
   ```

---

## 九、关键学习点

### 9.1 Phase 1 → Phase 3 的演进

| 阶段 | 核心能力 | 关键文件 |
|---|---|---|
| Phase 1 | Agent Runtime（Observe→Analyze→Plan→Execute） | `runtime.ts`, `prompts.ts` |
| Phase 2 | Memory 升级（分类、评分）、AgentDecision | `memory.ts`, `decisions.ts` |
| Phase 3 | 主动任务（Cron、通知、报告、调度） | `notification.ts`, `report.ts`, cron route |

### 9.2 架构原则

1. **渐进式增强**：Phase 3 的 Cron 有回退机制——没有 AgentSchedule 时自动使用 Phase 1 策略
2. **松耦合**：通知服务独立于 Agent Runtime，任何地方都可以创建通知
3. **类型安全**：联合类型（NotificationType、ScheduleType）替代 magic string
4. **数据最小化**：复用已有模型（AgentRun + Notification 替代独立的 Report 模型）

### 9.3 Prisma 索引设计

- `@@index([userId, read, createdAt])` — 覆盖最常见的查询：某用户的未读通知
- `@@index([enabled, nextRunAt])` — 覆盖 cron 查询：找到应该运行的用户
- `@@unique([userId, type])` — 业务约束：每个用户每类调度只有一个

---

## 十、下一步（Phase 4）

Phase 4 将构建 **Agent Center UI**：
- 通知列表 + 未读 badge
- Agent 建议展示（审批/拒绝）
- 历史决策时间线
- 学习报告查看
