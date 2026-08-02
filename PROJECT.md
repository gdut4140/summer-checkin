# Summer Checkin AI — 项目文档

> 一个基于 Next.js 16 的智能学习打卡平台，集成了 AI 对话、RAG 知识库、3D 成长岛、学习计划管理、数据统计等功能。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16.2 (App Router, Turbopack) |
| 语言 | TypeScript |
| 数据库 | MySQL 5.7 (通过 Prisma ORM + MariaDB adapter) |
| 认证 | Better Auth (email/password, session + cookie) |
| AI | DeepSeek API (兼容 OpenAI SDK), deepseek-v4-flash 模型 |
| 向量化 | Python 嵌入服务 (本地模型, Flask, port 8765) |
| 3D 渲染 | Three.js (@react-three/fiber, @react-three/drei) |
| 动画 | Framer Motion (motion) |
| UI | Tailwind CSS 4, shadcn/ui (base-ui), 自定义墨绿+玻璃白主题 |
| 部署 | Docker + docker-compose + Nginx 反向代理 |

---

## 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 根布局 (视频背景, 主题)
│   ├── page.tsx                  # Landing 页
│   ├── globals.css               # 全局样式/主题变量
│   ├── (auth)/                   # 认证页面
│   │   ├── layout.tsx            # 登录/注册布局
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (dashboard)/              # 主应用 (需登录)
│       ├── layout.tsx            # Dashboard 布局 (TopNav + PageTransition)
│       ├── dashboard/page.tsx    # 仪表盘首页 (3D岛 + 统计 + 图表)
│       ├── checkin/page.tsx      # 今日打卡
│       ├── plans/                # 学习计划
│       │   ├── page.tsx          # 计划列表
│       │   ├── new/page.tsx      # 新建计划
│       │   └── [id]/             # 计划详情/编辑
│       ├── calendar/page.tsx     # 打卡日历
│       ├── statistics/page.tsx   # 数据统计
│       ├── ranking/page.tsx      # 排行榜
│       ├── agent/page.tsx        # Agent 工作台
│       ├── ai/page.tsx           # AI 助手对话
│       ├── profile/page.tsx      # 个人主页
│       └── settings/page.tsx     # 设置
├── components/
│   ├── animations/               # 动画组件库
│   │   ├── fade-content.tsx      # 滚动淡入 (ReactBits 风格)
│   │   ├── blur-text.tsx         # 逐字模糊弹出
│   │   ├── counter.tsx           # 数字弹簧动画
│   │   └── page-transition.tsx   # 路由切换过渡
│   ├── dashboard/                # 仪表盘
│   │   ├── stats-cards.tsx       # 统计卡片 (连续/今日/完成率/排名)
│   │   ├── growth-chart.tsx      # 学习时长面积图
│   │   ├── recent-activity.tsx   # 最近活动
│   │   ├── hero-greeting.tsx     # 欢迎语动画
│   │   └── ambient-sound.tsx     # 雨声播放器 (胶囊滑块)
│   ├── landing/                  # Landing 页
│   │   ├── hero.tsx              # 首页英雄区
│   │   ├── features-grid.tsx     # 功能亮点
│   │   ├── how-it-works.tsx      # 使用流程
│   │   ├── cta-section.tsx       # 行动号召
│   │   ├── footer.tsx            # 页脚
│   │   ├── learning-island.tsx   # 3D 成长岛 (Three.js)
│   │   ├── ClickSpark.tsx        # 点击粒子特效
│   │   ├── TargetCursor.tsx      # 自定义光标 (金色圆形)
│   │   ├── SplitText.tsx         # GSAP 文字分裂动画
│   │   └── ShinyText.tsx         # 文字流光扫过
│   ├── plans/                    # 学习计划
│   │   ├── plan-card.tsx         # 计划卡片 (简约玻璃白)
│   │   ├── plan-card-grid.tsx    # 卡片网格 (带入场动画)
│   │   ├── plan-detail.tsx       # 计划详情视图
│   │   ├── plan-form.tsx         # 计划表单
│   │   └── new-plan-button.tsx   # 新建按钮
│   ├── layout/
│   │   ├── top-nav.tsx           # 顶部导航栏
│   │   └── global-cursor.tsx     # 全局光标包装
│   ├── calendar/heatmap.tsx      # 日历热力图
│   ├── statistics/               # 数据统计
│   │   ├── stats-summary.tsx     # 统计概览
│   │   ├── daily-chart.tsx       # 每日柱状图
│   │   ├── weekly-chart.tsx      # 每周折线图
│   │   └── subject-pie-chart.tsx # 科目饼图
│   ├── profile/                  # 个人主页
│   │   ├── profile-header.tsx
│   │   ├── profile-stats.tsx
│   │   ├── badges-grid.tsx
│   │   └── activity-timeline.tsx
│   ├── ai/                       # AI 对话
│   │   ├── chat-interface.tsx
│   │   ├── message-bubble.tsx
│   │   └── markdown-renderer.tsx
│   ├── agent/agent-workspace.tsx # Agent 工作台
│   ├── checkin/                  # 打卡
│   │   ├── checkin-form.tsx
│   │   └── mood-picker.tsx
│   ├── search-dialog.tsx         # 全局搜索 (⌘K)
│   └── ui/                       # shadcn/ui 组件库
├── lib/
│   ├── auth.ts                   # Better Auth 配置
│   ├── auth-utils.ts             # requireAuth, getCurrentUser
│   ├── prisma.ts                 # Prisma 客户端 (单例)
│   ├── deepseek.ts               # AI SDK Provider + 系统提示词
│   ├── agent/                    # Agent 工作流
│   │   ├── service.ts            # Agent Run 创建/管理/审批
│   │   └── types.ts              # Agent 类型定义
│   ├── rag/                      # RAG 知识库
│   │   ├── client.ts             # 调用 Python 嵌入服务
│   │   ├── retriever.ts          # 余弦相似度检索
│   │   ├── search.ts             # 知识库搜索 (嵌入+检索+重排)
│   │   ├── chunk.ts              # 文档分片
│   │   └── embedding_service/    # Python 嵌入服务
│   └── tools/                    # AI Tool Calling
│       ├── index.ts              # 工具注册工厂
│       └── agent-tools.ts        # Agent 专用工具
└── types/index.ts                # 全局 TypeScript 类型
```

---

## 核心功能

### 1. 用户认证系统

- **Better Auth** (v1.6) 实现邮箱+密码注册/登录
- Session 基于 Cookie，5分钟缓存避免跨标签不一致
- `requireAuth()` 在 layout 层强制鉴权，未登录自动重定向 `/login`
- 支持修改密码、个人资料

### 2. 仪表盘

- **3D 成长岛** — Three.js 渲染的动态岛屿，地砖/树木/灯塔根据真实打卡数据生长
  - 每次打卡解锁一块新地砖 (7×5 大岛)
  - 连续 ≥3 天长出树木，≥30 天满 4 棵
  - 打卡 ≥5 次出现学习桌，总学习时长升高积木
- **统计卡片** — 连续打卡天数、今日学习时长、本周完成率、排名 (数字弹簧动画)
- **学习时长图表** — Recharts 面积图展示 7 天趋势
- **欢迎语** — BlurText 逐字模糊弹出动画
- **雨声背景音** — rain.mp3 循环播放，右下角胶囊滑块调音量

### 3. 今日打卡

- 记录学习内容、时长、科目、心情
- 关联学习计划，自动累计进度
- 连续打卡天数 (streak) 自动计算

### 4. 学习计划

- **创建计划** — 目标名称、描述、学习目标、总时长、起止日期
- **查看详情** — 墨绿玻璃白风格卡片，进度双色条，按周分组的任务清单
- **AI 自动规划** — Agent 模式自动生成计划草案 (7-30 天，每日任务拆分)
- **进度追踪** — 打卡时长自动汇总，百分比进度条
- 支持编辑、删除、状态管理 (进行中/已完成/已暂停)

### 5. AI 助手 + Agent 工作流

- **AI 对话** — 基于 DeepSeek 的智能学习助手
  - Streaming 流式输出
  - Markdown 渲染 + 代码高亮
  - 20 轮上下文窗口
  - 多对话管理 (创建/切换/删除)
  - 长记忆自动提取与注入 (每次对话后异步提取 1-2 条关键信息)
  - 智能标题生成
- **记忆系统** (`src/lib/memory.ts`)
  - `extractAndSaveMemories()` — AI 从对话中提取偏好/目标/技能/事实，去重后存储
  - `getRelevantMemories()` — 查询最近 20 条记忆注入 system prompt
  - `formatMemoriesForPrompt()` — 格式化为 prompt 片段
- **Tool Calling** — AI 可主动调用工具 (工厂函数注入 userId)
  | 工具 | 类别 | 说明 |
  |------|------|------|
  | `getStudyStats` | 学习数据 | 总时长、日均、科目分布、连续打卡、计划进度 |
  | `createPlan` | 计划管理 | 创建学习计划 (name, goal, targetHours) |
  | `getMyPlans` | 计划管理 | 查询学习计划及打卡进度 |
  | `getRecentCheckins` | 学习数据 | 查询近期打卡记录 |
  | `getMyMemories` | 长期记忆 | 查询 AI 对用户的长期记忆 |
  | `searchKnowledgeBase` | RAG | 搜索知识库文档 (Agent开发、AI编程等) |
  | `breakdownPlanTasks` | Agent | 将学习计划拆分为每日/每周任务 (最多40个) |
  | `getPlanTasks` | Agent | 查询计划全部任务及完成统计 |
  | `updateTaskStatus` | Agent | 更新任务状态 (pending→in_progress→done/skipped)，支持自动创建打卡记录 |
  | `getTodayTasks` | Agent | 获取今日应完成的任务清单 |
- **Agent 工作台** (`/agent`)
  - 三步工作流: 收集数据(context) → 生成草案(planning) → 用户审批(approval)
  - 审批通过后自动创建 Plan + PlanTask
  - 审批拒绝后支持重新提交
  - Agent Run 运行历史列表 (status: running/awaiting_approval/completed/failed/cancelled)
  - 支持取消正在运行的 Agent

### 6. RAG 知识库

- **文档分片** — `splitText` / `splitMarkdown` 递归分块 (500字，50字重叠)
- **向量嵌入** — Python Flask 服务 (port 8765)，本地 sentence-transformers 模型
- **向量检索** — 全量加载到内存，余弦相似度排序 (数据量 < 1000 时极快)
- **重排序** — Python reranker 模型二次精排
- **知识库搜索** — `searchKnowledgeBase` 工具，AI 对话中自动触发

### 7. 数据统计

- **打卡日历** — GitHub 风格热力图，墨绿渐变
- **统计概览** — 总时长、学习天数、日均、最佳科目
- **排行榜** — 按总学习时长排名
- **个人主页** — 头像、总学习时长、打卡次数、连续天数

### 8. 长期记忆系统

- AI 对话中自动提取用户偏好/目标/习惯
- 存储为 `UserMemory`，注入 system prompt
- 支持查询和管理

### 9. 全局设计系统

- **墨绿 + 玻璃白主题** — CSS 自定义属性，dark mode
- **rain.mp4 视频背景** — 全屏固定，墨绿渐变蒙层
- **玻璃拟态** — `glass-panel` / `page-surface` 工具类，backdrop-blur
- **雨声背景音** — rain.mp3 自动循环播放，胶囊滑块调节音量，页面切换不中断（挂载在 Dashboard Layout）
- **点击粒子特效** — ClickSpark 组件，金色粒子飞出
- **动画组件库** — FadeContent (滚动淡入+模糊) / BlurText (逐字弹出) / Counter (数字弹簧) / PageTransition (路由切换)
- **shadcn/ui** — base-ui 组件库 (Card, Button, Dialog, DropdownMenu, Sheet, Input, Textarea, Badge, Progress, Avatar, etc.)
- **全局搜索** — `⌘K` 快捷键搜索对话框 (SearchDialog)
- **自适应** — 移动端汉堡菜单 (Sheet)，响应式布局

### 10. 其他功能

- **徽章系统** — Badge / UserBadge 模型，可扩展成就
- **全局搜索** — `⌘K` 快捷键搜索对话框 (SearchDialog)
- **自定义光标** — TargetCursor 组件，所有页面统一的金色圆形光标
- **ShinyText** — 文字流光扫过动画 (motion)
- **SplitText** — GSAP 文字逐字分裂动画 (ScrollTrigger)
- **学习记录** — StudyRecord 模型，追踪每日进度
- **AI 历史** — AIHistory 模型，记录 AI 功能使用情况
- **排行榜** — 按学习时长排名，支持周/月/全部筛选，金银铜奖牌样式
- **移动端适配** — 汉堡菜单 (Sheet)，响应式布局

---

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `api/auth/[...all]` | ALL | Better Auth 认证处理 (登录/注册/Session) |
| `api/ai` | POST | AI 对话 (Streaming + Tool Calling + RAG注入 + 记忆提取) |
| `api/conversations` | GET/POST/DELETE | 对话管理 |
| `api/conversations/[id]` | GET/PATCH | 对话消息 + 标题重生成 |
| `api/agent/runs` | GET/POST | Agent 运行列表 + 创建 |
| `api/agent/runs/[id]` | GET | Agent 运行详情 |
| `api/agent/runs/[id]/approval` | POST | 审批 Agent 计划 (approve/reject) |
| `api/agent/runs/[id]/cancel` | POST | 取消 Agent 运行 |

---

## 数据库模型 (Prisma Schema)

| 模型 | 说明 |
|------|------|
| `User` | 用户 (name, email, password, bio, image, theme) |
| `Session` | Better Auth 会话 |
| `Account` | Better Auth 账户 |
| `Plan` | 学习计划 (name, goal, targetHours, status, dates) |
| `PlanTask` | 计划任务 (title, dayNumber, category, priority, status) |
| `Checkin` | 打卡记录 (content, hours, subject, mood, date) |
| `StudyRecord` | 学习记录 |
| `Conversation` | AI 对话 |
| `ConversationMessage` | 对话消息 |
| `UserMemory` | AI 长期记忆 |
| `DocumentChunk` | 知识库文档分片 (含 embedding 向量) |
| `AgentRun` | Agent 运行记录 (goal, status, steps) |
| `AgentStep` | Agent 步骤 (context → planning → approval → execution) |
| `AgentApproval` | Agent 审批 (create_plan, pending/approved/rejected) |
| `AgentToolCall` | Agent 工具调用追踪 |
| `Badge` / `UserBadge` | 徽章系统 |
| `AIHistory` | AI 使用历史 |

---

## AI 系统提示词 (要点)

AI 角色定位为 "Summer AI 学习助手"，核心能力:
1. 制定个性化学习计划 (基于真实数据，按天/周拆分)
2. 将大目标拆分为每日可执行任务 (Agent 自动规划)
3. 每日学习检查与进度追踪
4. 解答学科问题
5. RAG 知识库搜索 (主动触发)
6. 长期记忆个性化回复

---

## 部署

- `Dockerfile` — Next.js standalone 构建
- `Dockerfile.embedding` — Python 嵌入服务镜像
- `docker-compose.yml` — MySQL + Embedding + App + Nginx 四容器编排
- `nginx/nginx.conf` — 反向代理，SSE 流式禁用缓冲
- `scripts/deploy.sh` / `scripts/deploy.ps1` — 一键部署脚本

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | MySQL 连接串 |
| `DASHSCOPE_API_KEY` | DeepSeek API Key |
| `DASHSCOPE_MODEL` | 模型名称 (deepseek-v4-flash) |
| `BETTER_AUTH_SECRET` | Auth 加密密钥 |
| `BETTER_AUTH_URL` | 生产环境 URL |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server Actions 加密 |
| `EMBEDDING_SERVICE_URL` | Python 嵌入服务地址 |

---

## 启动命令

```bash
# 开发
npm run dev

# 生成 Prisma Client
npx prisma generate

# 数据库迁移
npx prisma db push

# Docker 部署
docker compose up -d
```
