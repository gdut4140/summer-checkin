# Summer Checkin — AI 学习助手 · 项目架构理解文档

## 一、项目介绍

**Summer Checkin** 是一个 **AI 驱动的全栈学习管理系统**，核心定位是"用 AI Agent 主动管理用户的学习过程"——不只是被动回答问题的 Chatbot，而是能自主观察学习状态、分析问题、制定行动计划并执行的智能体。

**项目目标**：作为字节前端 + AI 应用方向面试的展示项目，体现全栈能力、AI Agent 工程化能力和产品思维。

### 核心功能

| 功能模块 | 说明 |
|----------|------|
| 📝 学习计划 | 创建计划、拆分每日任务、追踪进度、调整优先级 |
| ✅ 每日打卡 | 记录学习时长/科目/心情，连续打卡统计 |
| 📊 数据统计 | 学习时长趋势、科目分布、完成率、热力图 |
| 💬 AI 对话 | 流式 Markdown 渲染、Tool Calling（11 个工具）、深度思考模式 |
| 🧠 AI Agent | 自主学习循环（Observe→Analyze→Plan→Execute）、每日 Cron 自动运行 |
| 📚 长期记忆 | 6 种记忆类型、AI 重要性/置信度评分、智能去重、冷数据淘汰 |
| 🔍 RAG 知识库 | 文档切片 → Embedding → 向量召回 → 重排 → 注入 System Prompt |
| 🔔 通知系统 | Agent 分析结果推送、学习报告、提醒、鼓励 |
| 🌐 3D 着陆页 | Three.js 岛屿场景、GSAP 动效、自定义光标 |

---

## 二、技术架构

### 2.1 技术栈总览

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (Browser)                       │
│  React 19 + Next.js 16 App Router + Tailwind CSS 4       │
│  shadcn/ui + Recharts + react-markdown + Three.js        │
├─────────────────────────────────────────────────────────┤
│                   API 层 (Next.js Route Handlers)        │
│  AI SDK v7 (streamText) + OpenAI SDK (非流式)             │
│  Better Auth v1 (Session 鉴权)                            │
├─────────────────────────────────────────────────────────┤
│                   服务层 (src/lib/)                       │
│  Agent Runtime | Memory | RAG | Notification | Report    │
│  Tools: Study(5) + RAG(1) + Agent(4) + Coach(2)         │
├─────────────────────────────────────────────────────────┤
│                   数据层                                  │
│  Prisma ORM v7 + MariaDB/MySQL + Prisma MariaDB Adapter   │
│  RAG Embedding 存储在 JSON 字段（无独立向量数据库）        │
├─────────────────────────────────────────────────────────┤
│                   外部服务                                 │
│  DeepSeek API (v4-flash) — LLM + Embedding + Rerank      │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心依赖一览

| 类别 | 依赖 | 版本 | 用途 |
|------|------|------|------|
| 框架 | next | 16.2.10 | 全栈框架（RSC + Route Handlers） |
| UI | react, react-dom | 19.2.4 | UI 库 |
| 样式 | tailwindcss | v4 | 原子化 CSS |
| 组件库 | shadcn/ui + @base-ui/react | — | UI 组件 |
| 图表 | recharts | 3.9.2 | 学习统计图表 |
| 动画 | gsap, motion, three.js | — | 着陆页动效 + 3D 场景 |
| AI SDK | ai | 7.0.22 | streamText + Tool Calling |
| AI Provider | @ai-sdk/openai | 4.0.11 | 连接 DeepSeek（OpenAI 兼容） |
| AI Raw | openai | 6.45.0 | 非流式 LLM 调用（标题生成、Agent 分析） |
| Markdown | react-markdown + remark-gfm + rehype-highlight | — | AI 回复渲染 |
| 认证 | better-auth | 1.6.23 | 邮箱密码登录 + Session 管理 |
| ORM | prisma + @prisma/client | 7.8.0 | 数据库 ORM |
| 数据库驱动 | mariadb + @prisma/adapter-mariadb | 3.5.3 / 7.8.0 | MariaDB 连接 |
| 表单 | react-hook-form + zod + @hookform/resolvers | — | 表单校验 |
| 图标 | @phosphor-icons/react + lucide-react | — | 图标库 |

### 2.3 技术选型决策

**为什么用 Next.js App Router 而不是 Pages Router？**
- React Server Components 天然适合"数据驱动"的学习管理页面——服务端直接查 DB，不需要 API 中转
- Route Handlers（`route.ts`）替代了传统 Express/Koa 后端，全栈项目只需一个框架

**为什么 AI 调用有两套 SDK？**
- `ai` (AI SDK v7)：`streamText` 提供流式输出 + Tool Calling + `stopWhen` 多步循环，适合聊天场景
- `openai` (原生 SDK)：`client.chat.completions.create` 提供 `response_format: json_object` 结构化输出，适合 Agent Runtime 的非流式分析场景
- 两套并存是因为 AI SDK v7 的 `generateText` 在 `response_format` 支持上有限制，且 Agent Runtime 不需要流式

**为什么用 MariaDB JSON 存 Embedding 而不是 pgvector？**
- 当前阶段数据量小（单一用户的知识库文档），JSON 字段够用
- 避免引入 PostgreSQL 增加运维复杂度
- 余弦相似度在应用层计算（TypeScript），不在数据库层
- 如果知识库规模扩大（>10 万 chunks），可以迁移到 pgvector 或 Milvus

---

## 三、核心流程

### 3.1 AI 对话流程（流式逐字渲染）

```
用户输入 → fetch POST /api/ai
  → 后端: getAuthUser() 鉴权
  → 后端: 短期记忆截断（最近 20 轮）
  → 后端: 长期记忆注入 System Prompt ← getRelevantMemories()
  → 后端: RAG 知识库检索 ← searchKnowledge()
  → 后端: streamText({ model, system, messages, tools, stopWhen: isStepCount(10) })
  → 后端: toTextStream() + createTextStreamResponse() → HTTP 流式响应
  → 前端: res.body.getReader() 逐 chunk 读取
  → 前端: TextDecoder 解码 → setMessages 更新 state → react-markdown 渲染
  → 后端 onEnd: 保存 AI 回复到 DB + fire-and-forget 提取长期记忆
```

### 3.2 Agent 自主学习循环

```
runLearningAgent(userId)
  │
  ├─ Step 1: observe(userId)
  │   └─ Promise.all 并行查询 6 个数据源 → LearningContext
  │      - 全部/本周/今日打卡
  │      - 活跃计划（含打卡时长和任务统计）
  │      - 待办任务（优先级排序）
  │      - 目标类长期记忆
  │      - 计算：totalHours、dailyAvg、streak、subjectDistribution
  │
  ├─ Step 2-3: analyze(context) + plan（一次 LLM 调用完成）
  │   └─ OpenAI SDK chat.completions.create
  │      - model: deepseek-v4-flash
  │      - response_format: json_object
  │      - prompt 包含 AGENT_COACH_PROMPT + 全量学习数据 JSON
  │      - 输出 AgentAnalysis: { status, summary, findings[], actions[] }
  │      - LLM 不可用时 → fallbackAnalysis() 规则兜底
  │
  └─ Step 4: executeAction(userId, action, context, analysis)
      ├─ ENCOURAGE → 创建鼓励类 Notification
      ├─ CREATE_TASK → 自动创建 PlanTask 到活跃计划
      ├─ ADJUST_PLAN → 创建调整建议 Notification
      ├─ SEND_REMINDER → 创建提醒 Notification
      └─ GENERATE_REPORT → generateDailyReport() + formatReportAsMarkdown() → Notification

所有步骤记录到 AgentRun + AgentStep + AgentApproval + AgentDecision（可追溯）
```

### 3.3 定时 Cron 触发（每日自动运行）

```
GET /api/agent/cron/daily
  → 查找需要运行的用户
     ├─ AgentSchedule 优先（cron 匹配 + enabled）
     └─ 回退：活跃计划用户（Phase 1 策略）
  → 为每个用户: runLearningAgent(userId, { mode: "daily" })
  → 更新 AgentSchedule.lastRunAt / nextRunAt
  → 周日特殊: 生成周报
  → 清理: 30 天前已读通知
```

### 3.4 前端数据流

```
用户操作
  ↓
React Server Component（服务端直接查 DB）或 Client Component（useState + fetch）
  ↓
Server Actions / Route Handlers
  ↓
Prisma ORM
  ↓
MariaDB
  ↓
返回数据 → React 重渲染 → 页面更新
```

### 3.5 鉴权流程

```
用户访问 /dashboard/* → layout.tsx: requireAuth()
  → auth.api.getSession() 验证 Cookie
  → 未登录 → redirect("/login")
  → 已登录 → 渲染页面，user 对象通过 props 传递

API Route → getAuthUser() → auth.api.getSession()
  → 未登录 → 401 JSON
  → 已登录 → 继续处理
```

---

## 四、数据库设计

### 4.1 数据表全景（16 张表）

```
User ─────────────────────────────────────────────────────
  │
  ├── Session (1:N)          — 登录会话
  ├── Account (1:N)          — 认证账号
  ├── Plan (1:N)             — 学习计划
  │     └── PlanTask (1:N)   — 计划任务
  │     └── Checkin (1:N)    — 打卡记录
  ├── Checkin (1:N)          — 打卡（可关联 Plan 或 Task）
  ├── StudyRecord (1:N)      — 学习时长统计
  ├── AIHistory (1:N)        — AI 对话历史
  ├── Conversation (1:N)     — 多对话
  │     └── ConversationMessage (1:N) — 对话消息
  ├── UserMemory (1:N)       — 长期记忆
  ├── UserBadge (1:N)        — 用户徽章
  │     └── Badge (1:1)      — 徽章定义
  ├── AgentRun (1:N)         — Agent 运行记录
  │     ├── AgentStep (1:N)  — 运行步骤
  │     ├── AgentApproval (1:N) — 待审批项
  │     └── AgentToolCall (1:N) — 工具调用记录
  ├── AgentDecision (1:N)    — Agent 决策记录
  ├── Notification (1:N)     — 通知
  ├── AgentSchedule (1:N)    — 用户调度配置
  └── DocumentChunk          — RAG 文档块（全局共享，不关联 User）
```

### 4.2 关键索引设计

| 表 | 索引 | 用途 |
|----|------|------|
| UserMemory | `[userId, type]` | 按类型筛选记忆 |
| UserMemory | `[userId, importance]` | 按重要性排序（Agent 用） |
| UserMemory | `[userId, lastUsed]` | 冷数据淘汰 |
| Notification | `[userId, read, createdAt]` | 未读通知列表 |
| AgentSchedule | `[enabled, nextRunAt]` | Cron 查找待运行用户 |
| AgentSchedule | `@@unique([userId, type])` | 每用户每类型唯一调度 |
| PlanTask | `[userId, status]` + `[userId, dayNumber]` | 今日任务查询 |
| AgentRun | `[userId, status]` | 运行中/失败查询 |
| AgentToolCall | `[runId, toolName]` | 工具调用去重 |

### 4.3 设计亮点

- **Agent 决策独立存储**：AgentDecision 与 AgentRun 分离，Run 失败不影响已创建的 Decision
- **通知 = 报告**：DailyReport 以 Notification（type="report"）形式存储，避免模型冗余
- **Memory 质量评分**：importance + confidence 双维度，让 Agent 区分核心目标和琐碎事实
- **AgentSchedule 回退机制**：没有配置 Schedule 的用户自动回退到"有活跃计划即运行"

---

## 五、AI 架构详解

### 5.1 AI 模型

| 用途 | 模型 | 调用方式 |
|------|------|----------|
| 对话（流式） | deepseek-v4-flash | AI SDK `streamText()` |
| 对话（深度思考） | deepseek-v4-flash + thinking_mode | AI SDK `streamText()` with providerOptions |
| Agent 分析（非流式） | deepseek-v4-flash | OpenAI SDK `chat.completions.create` |
| 对话标题生成 | deepseek-v4-flash | OpenAI SDK |
| 长期记忆提取 | deepseek-v4-flash | OpenAI SDK |
| RAG Embedding | 通过 DeepSeek API | `embeddings.create()` |
| RAG Rerank | bge-small-zh-v1.5 | 通过 DeepSeek API |

### 5.2 Agent 类型判定

**属于 Planning Agent + ReAct 混合架构：**

- **Planning 特征**：Observe→Analyze→Plan→Execute 四步循环，先全局分析再生成 action list
- **ReAct 特征**：Analyze 和 Plan 合并为一次 LLM 调用（Reason + Act 一体），减少 API 调用次数
- **与 LangGraph 的对比**：本项目用更轻量的方式实现了类似效果——AI SDK 的 `stopWhen: isStepCount(10)` + Tool Calling 本身就是 Agent 循环

### 5.3 Tool Calling 分层

```
Layer 1: 对话内工具（src/lib/tools/study-tools.ts, agent-tools.ts）
  - 用户聊天时触发
  - AI SDK tool() 定义，Zod schema 校验参数
  - 工厂函数 createStudyTools(userId) 闭包注入用户身份

Layer 2: Agent Runtime 工具（src/lib/agent/runtime.ts + coach-tools.ts）
  - Agent 自主运行时触发
  - executeAction() switch-case 分发
  - 自动创建 Notification / PlanTask 等
```

### 5.4 工具清单（11 个）

| # | 工具名 | 分组 | 功能 |
|---|--------|------|------|
| 1 | createPlan | Study | 创建学习计划 |
| 2 | getMyPlans | Study | 查询计划和进度 |
| 3 | getRecentCheckins | Study | 查询打卡记录 |
| 4 | getStudyStats | Study | 综合学习统计 |
| 5 | getMyMemories | Study | 查询长期记忆 |
| 6 | searchKnowledgeBase | RAG | 搜索知识库文档 |
| 7 | breakdownPlanTasks | Agent | 拆分计划为每日任务 |
| 8 | getPlanTasks | Agent | 查询计划任务进度 |
| 9 | updateTaskStatus | Agent | 更新任务状态 |
| 10 | getTodayTasks | Agent | 获取今日任务清单 |
| 11 | analyzeStudyPattern | Coach | 分析学习模式（强弱项/趋势） |

### 5.5 Memory 系统

```
记忆生命周期:
  对话结束 → extractAndSaveMemories() [fire-and-forget]
    → AI 提取 1-3 条关键信息
    → importance + confidence + type 三要素
    → 语义匹配去重（同 type + 同语义 → 更新评分）
    → 存入 UserMemory

  对话开始 → getRelevantMemories() [最近 20 条]
    → formatMemoriesForPrompt() [按类型分组 + 重要性标注]
    → 注入 System Prompt

  Agent 运行 → getImportantMemories() [按重要性排序 Top-10]
    → touchMemories() [标记 lastUsed]

  冷记忆淘汰（cleanupColdMemories，待接入 Cron）:
    ① importance ≥ 0.8 → 永远保留
    ② confidence < 0.3 且 importance < 0.5 → 删除
    ③ importance < 0.3 且超过 30 天未用 → 删除
    ④ importance < 0.5 且超过 60 天未用 → 删除
```

### 5.6 RAG 知识库

```
数据写入（手动/脚本）:
  文档 → splitMarkdown() 分块 → embedTexts() 批量向量化
    → DocumentChunk { sourceName, chunkIndex, content, embedding }

查询流程:
  query → embedText(query) → 向量 Embedding
    → searchSimilarChunks(cosineSimilarity, Top-K 召回)
    → rerank(query, documents) [bge-small-zh-v1.5 重排]
    → Top-N 结果 → formatKnowledgeForPrompt()
    → 注入 System Prompt
```

### 5.7 Prompt 设计体系

| Prompt | 用途 | 设计要点 |
|--------|------|----------|
| SYSTEM_PROMPT | AI 对话系统提示词 | 角色定义 + 能力边界 + 工作流指引（计划三步法 + Agent 拆分检查） |
| AGENT_COACH_PROMPT | Agent Runtime 分析提示词 | 朋友语气、"你"人称、数据驱动决策、JSON 结构化输出 |
| EXTRACTION_PROMPT | 长期记忆提取 | 6 种 type 定义 + importance/confidence 评分标准 + 语义匹配去重 |

---

## 六、前端页面

### 6.1 页面路由表

| 路由 | 页面 | 类型 | 鉴权 |
|------|------|------|------|
| `/` | Landing Page（3D 岛屿） | SSR（静态） | 无 |
| `/login` | 登录 | Client | 无 |
| `/register` | 注册 | Client | 无 |
| `/dashboard` | 仪表盘 | RSC + Client | requireAuth |
| `/ai` | AI 对话 | Client（流式） | requireAuth |
| `/agent` | Agent Center | Client | requireAuth |
| `/checkin` | 每日打卡 | Client | requireAuth |
| `/calendar` | 打卡热力图 | Client | requireAuth |
| `/statistics` | 学习统计 | Client | requireAuth |
| `/plans` | 计划列表 | RSC | requireAuth |
| `/plans/new` | 新建计划 | Client | requireAuth |
| `/plans/[id]` | 计划详情 | RSC + Client | requireAuth |
| `/plans/[id]/edit` | 编辑计划 | Client | requireAuth |
| `/settings` | 个人设置 | Client | requireAuth |
| `/profile` | 个人主页 | RSC | requireAuth |

### 6.2 组件架构（~60 个组件）

```
components/
├── ui/ (20+)            — shadcn/ui 基础组件（button, card, dialog, tabs...）
├── layout/              — top-nav, notification-bell, global-cursor
├── landing/             — hero, features-grid, how-it-works, 3D island
├── dashboard/           — stats-cards, quick-actions, growth-chart, ambient-sound
├── ai/                  — chat-interface, message-bubble, markdown-renderer
├── agent/               — agent-workspace, coach-overview, decision-timeline, notification-center
├── plans/               — plan-card, plan-form, plan-detail, new-plan-button
├── checkin/             — checkin-form, mood-picker
├── statistics/          — daily-chart, weekly-chart, subject-pie-chart, stats-summary
├── profile/             — profile-header, profile-stats, activity-timeline, badges-grid
├── calendar/            — heatmap
└── settings/            — profile-form, password-form, theme-toggle
```

---

## 七、优缺点分析

### 优点

1. **AI Agent 工程化程度高**：不是简单的"调 API 回答问题"，而是实现了完整的 Observe→Analyze→Plan→Execute 循环 + 长期记忆 + RAG + 决策追溯，达到了面试展示水平
2. **全栈覆盖完整**：从前端（React 19 RSC）到后端（Route Handlers）到数据库（Prisma + 16 张表）到 AI（两种 SDK 分层使用），一己之力完成
3. **代码组织清晰**：`src/lib/` 按领域拆分（agent/、rag/、tools/），工厂函数模式（`createStudyTools(userId)`）解决身份注入问题
4. **流式体验完整**：后端 `toTextStream()` + 前端 `ReadableStream` 手动读取，真正的逐 token 渲染
5. **渐进式增强**：AgentSchedule 有回退机制、LLM 不可用时有 `fallbackAnalysis` 规则兜底、Rerank 失败回退纯向量排序
6. **类型安全**：TypeScript 联合类型替代 magic string、ActionResult 判别联合、Zod schema 校验 Tool 参数
7. **面试友好**：每个关键文件都有清晰的设计理念注释，笔记系统记录了学习过程

### 可改进点

1. **React Compiler 未充分利用**：`next.config.ts` 开启了 `reactCompiler: true`，但部分组件仍有不必要的 `useState`/`useCallback`
2. **AbortController 未实现**：`handleStop()` 函数标记了 `TODO: Day 10+ 实现真正的中断`，目前只是前端停止渲染，后端流仍在运行
3. **Embedding 存储在 JSON**：当前方案在小数据量下可行，但不支持向量索引，查询效率随数据量线性下降
4. **记忆淘汰未接入**：`cleanupColdMemories` 已实现但未接入 Cron，长期运行的记忆表会持续增长
5. **Agent Run 无并发控制**：如果多个 Cron 同时触发同一用户，可能产生重复分析和通知
6. **前端缺少 Suspense 边界**：RSC 页面缺少 Loading 和 Error 边界，网络慢时体验不佳
7. **测试覆盖为 0**：无单元测试、集成测试或 E2E 测试

### 项目等级

**中高级全栈项目**，AI Agent 部分达到面试展示水平。

不是企业级的原因：缺少测试、监控、CI/CD、错误追踪、灰度发布等工程化基础设施。但就"个人展示项目"而言，架构完整度和 AI 深度已经远超大多数面试项目。

---

## 八、优化路线

### 短期（1-2 周）

- [ ] 实现真正的 `AbortController` 流式中断
- [ ] 将 `cleanupColdMemories` 接入 Cron
- [ ] 添加 RSC Loading/Error 边界（Suspense + error.tsx）
- [ ] 对 `runLearningAgent` 加乐观锁防并发

### 中期（1-2 月）

- [ ] 迁移到 pgvector（如果知识库增长到 10 万+ chunks）
- [ ] 添加核心模块的单元测试（vitest）
- [ ] PWA 支持（Service Worker + 离线缓存）
- [ ] E2E 测试（Playwright）
- [ ] 通知支持 Web Push API

### 长期

- [ ] Multi-Agent 架构：不同 Agent 负责不同维度（进度 Agent、习惯 Agent、知识 Agent）
- [ ] 向量化长期记忆（语义检索替代关键词去重）
- [ ] 学习路径自动生成（基于知识图谱）
- [ ] 社区功能（学习小组、排行榜）

---

## 九、面试回答模板

### Q1: 介绍一下你的项目

> "我做的 Summer Checkin 是一个 AI 驱动的学习管理系统。核心亮点是 AI Agent——它不只是被动回答问题的聊天机器人，而是一个自主运行的智能体。系统会定时自动收集用户的学习数据（打卡、计划进度、任务完成率），用 LLM 分析学习状态，然后自动执行干预——比如发现用户连续一周没学算法，会自动创建提醒通知、调整任务优先级。技术栈是 Next.js 16 全栈 + Prisma + MariaDB，AI 层用了 DeepSeek v4-flash 加上自建的 RAG 知识库和长期记忆系统。"

### Q2: 你的 AI Agent 和普通 ChatGPT 有什么区别？

> "三个核心区别。第一，ChatGPT 是被动的——你问它答。我的 Agent 是主动的——它会定时自动运行，观察用户学习数据，发现问题后主动推送通知。第二，Agent 有工具——它能真正操作数据库，创建任务、调整计划、发送提醒，不只是生成文字。第三，决策可追溯——每次 Agent 的行动都记录在 AgentDecision 表里，可以统计采纳率、优化 Prompt。"

### Q3: 你的 RAG 怎么降低幻觉？

> "三个层次。第一层是 Prompt 约束——System Prompt 明确要求 AI 优先基于检索结果回答，标明来源，没找到就诚实说明。第二层是检索质量——用两阶段检索（向量召回 Top-20 + bge-small 重排 Top-5），确保给 LLM 的是最相关的文档片段。第三层是应用层兜底——如果重排服务挂了，自动回退到纯向量排序，不阻塞对话流。"

### Q4: 你的数据库为什么这样设计？

> "设计原则是'让查询跟着业务走'。比如 Notification 表的复合索引 `[userId, read, createdAt]` 覆盖了'获取用户未读通知'这个最高频查询。Agent 相关的 5 张表（AgentRun/Step/Approval/ToolCall/Decision）拆分得比较细，因为每张表有不同的查询模式和生命周期——比如 AgentToolCall 需要按 toolName 去重，AgentDecision 需要按 type 统计采纳率，拆开之后索引更精准。"

### Q5: 为什么不用 pgvector？

> "当前阶段没有必要。我的知识库数据量很小（几十个文档），向量存在 MariaDB JSON 字段里，应用层用 TypeScript 算余弦相似度完全够用。引入 PostgreSQL + pgvector 会增加运维复杂度（多一个数据库实例）。如果将来知识库增长到十万级别，迁移成本也不高——Embedding 已经是结构化 JSON，写个脚本导出再导入 pgvector 就行。"

### Q6: 如果用户量增加 100 倍怎么办？

> "几个瓶颈点。第一，Cron 逐个用户运行 Agent 会超时——需要改成消息队列（比如 BullMQ），每个用户一个 Job，Worker 并行消费。第二，流式 AI 对话的并发——Next.js 默认单进程，需要配合 PM2 cluster 模式或部署到 Serverless 平台。第三，数据库——MariaDB 读写分离，高频查询加 Redis 缓存（比如未读通知数、连续打卡天数）。第四，RAG——如果知识库也 100 倍增长，就必须迁移到 pgvector 或 Milvus 了。"

---

> *由 Claude Code 基于项目代码自动分析生成 · 2026-08-04*
