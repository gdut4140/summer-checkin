# Step 1: Agent Runtime — 自主学习循环的核心引擎

> 对应进阶路线 Phase 1：Agent Context → Observe → Analyze → Plan → Execute

## 一、这次做了什么

从「被动回答问题的 AI 助手」升级为「主动管理学习的 AI Agent」，实现了 **Agent Runtime 核心循环**。

### 新增文件

| 文件 | 作用 | 对应 PRD 章节 |
|------|------|-------------|
| `src/lib/agent/prompts.ts` | Agent Coach 系统提示词 | 五、AI Prompt 设计 |
| `src/lib/agent/runtime.ts` | Observe→Analyze→Plan→Execute 循环引擎 | 一、Agent 自主学习循环 |
| `src/lib/tools/coach-tools.ts` | analyzeStudyPattern + adjustLearningPlan 工具 | 三、新增 Agent Tools |
| `src/app/api/agent/cron/daily/route.ts` | 每日自动触发 Agent 的 API | 四、主动触发机制 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/agent/index.ts` | 新增 prompts/runtime 导出 |
| `src/lib/tools/index.ts` | 新增 createCoachTools 导出 |
| `src/app/api/ai/route.ts` | 对话路由注入 coach tools |

---

## 二、核心架构：Observe → Analyze → Plan → Execute

```
runLearningAgent(userId)
      │
      ├── Step 1: observe(userId)
      │   └── 并行查询 DB → 合并为 LearningContext
      │       - 用户画像（目标记忆、活跃计划）
      │       - 学习统计（总时长、日均、本周、连续打卡）
      │       - 计划进度（完成率、任务状态分布）
      │       - 待办任务列表
      │       - 近期打卡记录
      │
      ├── Step 2-3: analyze(context) + plan
      │   └── 调用 LLM（DeepSeek），prompt 包含：
      │       - AGENT_COACH_PROMPT（角色定义）
      │       - 用户全量学习数据（JSON）
      │       - 长期记忆
      │   └── LLM 返回 AgentAnalysis JSON：
      │       - status: on_track | need_attention | need_adjustment | at_risk
      │       - findings[]: 具体发现 + 严重程度 + 数据证据
      │       - actions[]: 建议行动 + 类型 + 优先级
      │   └── LLM 不可用时 fallbackAnalysis() 基于规则兜底
      │
      └── Step 4: executeAction(userId, action)
          └── 根据 action.type 执行：
              - ENCOURAGE → 返回鼓励文案
              - CREATE_TASK → 创建具体任务
              - ADJUST_PLAN → 调整优先级/添加任务
              - SEND_REMINDER → 生成提醒
              - GENERATE_REPORT → 生成报告
```

### 关键设计决策

**1. analyze 调用一次 LLM 完成两步**

Analyze 和 Plan 合并为一次 LLM 调用（而非两次），因为：
- LLM 分析数据的同时自然会产生行动建议
- 减少 API 调用次数（成本 + 延迟）
- 分析结果和行动建议的逻辑连贯性更好

**2. fallbackAnalysis 规则兜底**

当 LLM 不可用时（API 挂了、限流等），不直接失败，而是用阈值规则做基本判断：
- 计划进度 < 30% → warning
- 待办数 > 5 → 建议调整
- 日均 < 0.5h → 提示增加学习量
- 无活跃计划 → 建议创建

**3. 所有决策写入 AgentRun → 可追溯**

Agent 的每一步都记录到 `AgentRun` + `AgentStep` + `AgentApproval`，后续可以：
- 查看历史决策
- 统计 Agent 干预效果
- 优化 prompt 和分析逻辑

---

## 三、学到的新概念

### 3.1 Agent Loop（智能体循环）

这是 AI Agent 最核心的设计模式：

```
Observe → Analyze → Plan → Execute → Reflect → (回到 Observe)
```

它和普通 Chatbot 的本质区别：

| | 普通 Chatbot | Agent |
|---|---|---|
| 触发方式 | 用户主动提问 | 可自主运行（cron/事件） |
| 工作模式 | 一问一答 | 多步循环，持续观察 |
| 输出 | 文本回复 | 文本 + 工具调用 + 数据写入 |
| 目标 | 回答正确 | 帮助用户达成目标 |
| 状态 | 无状态 | 有上下文、有记忆、有历史决策 |

**面试可以这样说**：
> "Agent 和 Chatbot 的核心区别在于 Agent 有自主循环能力。它不只是响应式的问答，而是主动 Observe（收集数据）→ Analyze（LLM 分析问题）→ Plan（制定行动）→ Execute（调用工具执行）→ Reflect（记录结果优化后续决策），形成一个持续改进的闭环。"

### 3.2 Tool Calling 的两层设计

本项目里 Tool Calling 有两个层级：

**Layer 1: 对话内工具**（AI 对话路由 `api/ai/route.ts`）
- 用户发消息 → AI 判断需要调用哪个工具 → 执行 → 基于结果回复
- 工具包括：createPlan, getStudyStats, getTodayTasks 等

**Layer 2: Agent Runtime 工具**（本次新增 `runtime.ts`）
- Agent 自主运行 → collect 数据 → LLM 分析 → 调用 executeAction
- 这是"离线"执行，不需要用户在对话中交互

**面试可以这样说**：
> "我们把工具调用分成了两层。第一层是对话内工具，用户在和 AI 聊天时触发，AI 根据上下文判断需要调用什么。第二层是 Agent Runtime 工具，Agent 在后台自主运行时调用，不需要用户参与。这样设计的好处是关注点分离——对话体验和自主决策互不干扰。"

### 3.3 Fallback 模式（降级策略）

`fallbackAnalysis()` 是这个模式的好例子：

```typescript
try {
  // 主路径：LLM 深度分析
  const analysis = await callLLM(context);
} catch (error) {
  // 降级路径：基于规则的简单判断
  const analysis = fallbackAnalysis(context);
}
```

**为什么重要**：
- LLM API 不可靠（限流、超时、返回格式错误）
- 不能因为 LLM 挂了就让整个 Agent 崩溃
- 降级后的判断虽不如 LLM 精准，但至少能给出基本反馈

**面试可以这样说**：
> "任何依赖外部 API 的系统都应该有降级策略。我们的 Agent Runtime 在主路径上使用 LLM 做深度分析，但如果 LLM 不可用，会降级到基于阈值的规则判断。这保证了系统的可用性——即使 AI 挂了，用户也能看到基本的学习状态分析。"

### 3.4 Context Aggregation（上下文聚合）

`observe()` 函数的核心价值：**把分散的数据聚合成 LLM 可理解的上下文**。

```typescript
// 并行查询 6 个数据源
const [checkins, weekCheckins, todayCheckins, plans, tasks, memories] =
  await Promise.all([...]);

// 聚合为结构化 JSON
return {
  profile: { ... },
  stats: { totalHours, dailyAvg, weekHours, streak, ... },
  plans: [{ name, progress, taskStats }],
  pendingTasks: [{ title, planName, priority }],
  recentCheckins: [{ date, hours, subject, mood }],
};
```

**设计要点**：
- 用 `Promise.all` 并行查询减少延迟
- 返回结构化的 JSON（而非扁平列表），方便 LLM 理解
- 包含趋势数据（本周 vs 全部），而不只是快照

---

## 四、新增的两个 AI 工具

### Tool 10: analyzeStudyPattern

```typescript
// 输入
{ days: 30 }  // 分析最近30天

// 输出
{
  pattern: {
    weakSubjects: ["算法"],        // 弱项科目
    strongSubjects: ["React"],     // 强项科目
    trend: "declining",            // 整体趋势
    streakDays: 5,                 // 连续打卡天数
    avgDailyHours: 1.2,            // 日均学习时长
    completionRate: 0.45,          // 任务完成率
    totalUnfinishedTasks: 8,       // 待办数量
    suggestion: "⚠️ 近期学习时长..." // AI 生成的建议
  },
  details: [                       // 每个科目的详细数据
    { subject: "React", totalHours: 12, recentHours: 3, trend: "up", ... },
    ...
  ]
}
```

这个工具比 `getStudyStats` 更进一步：
- `getStudyStats`：查数据（是什么）
- `analyzeStudyPattern`：诊断问题（为什么、怎么办）

### Tool 11: adjustLearningPlan

Agent 的"干预手"——根据分析结果修改计划：
- `reprioritize`：批量修改任务优先级
- `addTasks`：批量添加补救任务

---

## 五、下一步（Phase 2 预览）

当前 Phase 1 完成了核心循环，下一步 Phase 2：
- UserMemory 升级（type/importance/confidence 字段）
- AgentDecision 模型（持久化 Agent 决策记录）
- Memory 检索优化（向量化？重要性排序？）

---

## 六、关键代码片段速查

### 调用 Agent 循环

```typescript
import { runLearningAgent } from "@/lib/agent";

// 手动触发
const result = await runLearningAgent(userId, { mode: "coach" });
// result = { runId, status, context, analysis, executedActions }

// Cron 触发
GET /api/agent/cron/daily
// → 自动扫描所有活跃用户并运行 Agent
```

### 在对话中使用 coach tools

用户对 AI 说：
> "分析一下我最近的学习情况"

AI 会自动调用 `analyzeStudyPattern` 工具，返回诊断结果。

---

> **一句话总结**：Phase 1 建立了 Agent 的"大脑"（Observe → Analyze → Plan → Execute 循环）和"双手"（analyzeStudyPattern + adjustLearningPlan 工具），让系统从被动回答进化为主动管理。
