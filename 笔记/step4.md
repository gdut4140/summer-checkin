# Step 4: Phase 4 — Agent Center UI（教练面板 + 通知中心 + 决策记录）

## 概述

Phase 4 的核心目标：为 Agent 系统构建一个**完整的用户界面**，让用户可以看到 AI 分析结果、管理通知、追溯历史决策。

之前的 Phase 1-3 已经完成了：
- Agent Runtime（观察→分析→规划→执行循环）
- Memory 升级（分类、评分、衰减）
- 主动任务系统（Cron、通知生成、报告生成）

但这些功能都只在后端/数据库中运行，用户看不到。Phase 4 要做的是：

- **教练面板**：用户打开 `/agent` 就能看到 AI 教练的今日洞察
- **通知中心**：所有 Agent 生成的通知集中展示和管理
- **决策记录**：Agent 的历史决策时间线，可采纳/拒绝
- **工作台**：保留原有的 Agent 运行功能

---

## 一、新增 API 路由

### 1.1 决策 API

```
GET    /api/agent/decisions       — 获取决策列表 + 统计
PATCH  /api/agent/decisions/[id]  — 采纳/拒绝单条决策
```

**GET 响应格式：**

```json
{
  "decisions": [
    {
      "id": "cuid...",
      "type": "PLAN_ADJUST",
      "reason": "算法连续3天未完成",
      "action": { "detail": "建议增加算法学习比例" },
      "status": "pending",
      "createdAt": "2026-08-03T09:00:00.000Z"
    }
  ],
  "stats": {
    "total": 15,
    "byType": { "PLAN_ADJUST": 3, "TASK_CREATE": 5, "REMINDER": 4, "ANALYSIS": 3 },
    "byStatus": { "executed": 10, "pending": 3, "rejected": 2 },
    "recentRate": 75
  }
}
```

**PATCH 请求格式：**

```json
{
  "status": "executed",
  "feedback": "同意调整"
}
```

**设计理由：** 决策 API 独立于 Agent Run API。Agent Run 关注的是"运行过程"（步骤、审批），Decision 关注的是"决策结果"（类型、状态、反馈）。分开后各自职责清晰。

---

## 二、教练面板（Coach Overview）

### 2.1 文件：`src/components/agent/coach-overview.tsx`

### 2.2 页面结构

```
┌─────────────────────────────────────────────────────────┐
│ 🧠 AI 学习教练                    [立即分析] 按钮         │
│ 正在分析你的学习状态，为你提供个性化建议                       │
├─────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
│ │今日  │ │本周  │ │连续  │ │任务  │                    │
│ │2h    │ │12h   │ │7天   │ │70%   │                    │
│ └──────┘ └──────┘ └──────┘ └──────┘                    │
├─────────────────────────────┬───────────────────────────┤
│ ✅ 进展顺利                  │ 待处理 (3 项)              │
│ 当前2个活跃计划，连续7天打卡  │ ┌─ 计划调整 — 前天        │
│                             │ ┌─ 提醒 — 昨天            │
│ ⚠️ 分析发现                  │ ┌─ 新建任务 — 今天        │
│ ┌─ 警告: 算法连续3天未完成    │                           │
│ ┌─ 提示: 日均学习0.5h需增加   │ 🔔 3 条未读通知           │
└─────────────────────────────┴───────────────────────────┘
```

### 2.3 数据流

```
CoachOverview (client component)
    │
    ├── fetch("/api/agent/runs")        → 最新分析结果、stats
    ├── fetch("/api/agent/decisions")   → 待处理决策
    └── fetch("/api/notifications")     → 未读计数
```

### 2.4 设计哲学

- **信息层级**：统计卡片 → 核心状态 → 分析发现 → 待处理决策（从重要到次要）
- **颜色语义**：
  - 绿色 (emerald) = 正常/顺利
  - 黄色 (amber) = 需要关注
  - 红色 (red) = 严重/风险
- **状态标签系统**：用 `emoji + 文字 + 颜色` 三维度表达状态，降低认知负担

### 2.5 StatCard 组件

封装了统一的统计卡片样式：
- 左侧：主题色半透明圆角图标
- 右侧：标签（大写小字） + 数值（大字体 tabular-nums）
- 可选的趋势箭头（TrendUp / TrendDown）
- hover 时微缩放（`scale-[1.02]`）

---

## 三、通知中心（Notification Center）

### 3.1 文件：`src/components/agent/notification-center.tsx`

### 3.2 功能

| 功能 | 实现 |
|---|---|
| 类型筛选 | 6 个 pill 按钮（全部/提醒/分析/报告/鼓励/系统） |
| 未读标记 | 蓝色圆点 + 左侧边框高亮 |
| 点击展开 | 展开完整内容，自动标记已读 |
| 报告预览 | markdown 渲染（react-markdown） |
| 全部已读 | 一键标记所有通知为已读 |
| 删除 | 单条删除 |
| 相对时间 | "刚刚" / "3分钟前" / "2小时前" / "3天前" |
| 空状态 | 当没有通知时的引导文案 |

### 3.3 类型图标映射

```typescript
reminder     → BellRinging (🔔 提醒)
analysis     → ChartBar    (📊 分析)
report       → Newspaper   (📰 报告)
encouragement → Fire       (🔥 鼓励)
system       → Gear        (⚙️ 系统)
```

### 3.4 设计要点

- **列表项设计**：左侧图标 → 标题+预览 → 右侧时间+类型标签
- **展开交互**：点击卡片展开完整内容，报告类型用 markdown 渲染
- **未读提示**：未读项有 `border-primary/30` 边框 + `ring-1 ring-primary/10` 光环
- **已读项**：降低透明度 (`opacity-70`)，hover 时恢复

---

## 四、决策记录（Decision Timeline）

### 4.1 文件：`src/components/agent/decision-timeline.tsx`

### 4.2 功能

| 功能 | 实现 |
|---|---|
| 统计概览 | 4 个小卡片显示各类型决策数量，点击可快速筛选 |
| 时间线 | 左侧竖线 + 日期分组（今天/昨天/N天前/具体日期） |
| 筛选 | 类型 pill 按钮 |
| 采纳/拒绝 | pending 状态的决策可以操作 |
| 采纳率 | 最近7天采纳率百分比 |
| 空状态 | 无决策时的引导 |

### 4.3 时间线布局

```
● 今天
│  ┌──────────────────────────────────────┐
│  │ 🔧 计划调整   [已执行]                 │
│  │ 算法连续3天未完成，需增加练习            │
│  │ ┌──────────────────────────────────┐ │
│  │ │ 建议增加算法学习比例                │ │
│  │ └──────────────────────────────────┘ │
│  │ 8月3日 09:00                         │
│  └──────────────────────────────────────┘
│
● 昨天
│  ┌──────────────────────────────────────┐
│  │ 📋 新建任务   [待确认]   [拒绝] [采纳]  │
│  │ React 任务完成度不足                   │
│  └──────────────────────────────────────┘
```

### 4.4 决策类型配置

```typescript
PLAN_ADJUST  → GitBranch (🔀 计划调整) → violet
TASK_CREATE  → Target   (🎯 新建任务) → emerald
REMINDER     → Timer    (⏰ 提醒)     → amber
ANALYSIS     → Lightning(⚡ 分析)     → blue
```

---

## 五、Tab 导航系统

### 5.1 文件：`src/components/agent/agent-tabs.tsx`

### 5.2 设计

- **导航栏**：glass-panel 圆角容器，内部 4 个等宽 tab 按钮
- **激活态**：`bg-primary text-primary-foreground shadow-lg shadow-primary/20`
- **非激活态**：`text-muted-foreground` 文字，hover 时高亮
- **图标权重**：激活用 `weight="fill"`，非激活用 `weight="regular"`
- **内容切换**：`animate-in fade-in slide-in-from-bottom-2` 过渡动画

### 5.3 Tab 列表

| Tab | 图标 | 说明 |
|---|---|---|
| 教练面板 | Brain | AI 洞察与学习概览 |
| 通知中心 | Bell | 消息与报告 |
| 决策记录 | ClockCounterClockwise | Agent 决策历史 |
| 工作台 | Robot | 创建与管理 Agent 运行 |

---

## 六、设计升级：深色主题统一

### 6.1 原有问题

Phase 1-3 的 AgentWorkspace 使用了亮色背景的审批卡片：
- `bg-[#eaf6ef]`（浅绿色）
- `bg-[#fef0f0]`（浅红色）
- `bg-[#fef9e7]`（浅黄色）
- `bg-white/60`（白色）

这些颜色在暗色主题 (`#0c1f19` 背景) 中显得突兀。

### 6.2 统一后的配色

```css
/* 旧 → 新 */
bg-[#eaf6ef] → bg-emerald-500/5 border-emerald-500/20  /* 分析发现 */
bg-[#fef9e7] → bg-amber-500/10 border-amber-500/20     /* 警告 */
bg-[#fef0f0] → bg-red-500/10 border-red-500/20         /* 严重 */
bg-white/60  → bg-background/60 border-border/40       /* 计划草案卡片 */
text-[#2d5a3d] → text-emerald-400                      /* 绿色文字 */
text-[#1e4a2d] → text-foreground                       /* 标题 */
```

### 6.3 半透明背景系统

所有的卡片都使用 `backdrop-blur-sm` 或 `backdrop-blur-xl`，配合半透明背景色，形成了统一的毛玻璃效果：

```css
"bg-emerald-500/5 backdrop-blur-xl"  /* 正常信息卡片 */
"bg-amber-500/10 backdrop-blur-sm"   /* 警告卡片 */
"bg-red-500/10 backdrop-blur-sm"     /* 严重警告卡片 */
```

---

## 七、文件清单

### 新增文件

```
src/app/api/agent/decisions/route.ts        — GET 决策列表
src/app/api/agent/decisions/[id]/route.ts   — PATCH 更新决策状态
src/components/agent/coach-overview.tsx      — 教练面板组件
src/components/agent/notification-center.tsx — 通知中心组件
src/components/agent/decision-timeline.tsx   — 决策时间线组件
src/components/agent/agent-tabs.tsx          — Tab 导航容器
```

### 修改文件

```
src/app/(dashboard)/agent/page.tsx           — 引入 AgentTabs
src/components/agent/agent-workspace.tsx     — 深色主题统一
```

---

## 八、关键学习点

### 8.1 Client Component 数据获取模式

所有新组件都是 Client Component (`"use client"`)，使用 `useEffect` + `fetch` 模式获取数据：

```typescript
const fetchData = useCallback(async () => {
  const res = await fetch("/api/...");
  const data = await res.json();
  setData(data);
}, []);

useEffect(() => { fetchData(); }, [fetchData]);
```

**为什么不放在 Server Component 中？**
- 数据会频繁变化（通知已读状态、决策状态等）
- 用户交互后需要即时刷新（不需要整页重新加载）
- 每个 Tab 的数据是独立的，按需加载（不是所有用户都会访问所有 tab）

### 8.2 状态驱动的 UI

每个组件都有三种状态：

```typescript
if (loading) return <LoadingSkeleton />;
if (error) return <ErrorState onRetry={fetchData} />;
if (data.length === 0) return <EmptyState />;
return <DataView />;
```

这是来自大厂（Stripe、Vercel、Linear）的标准模式。

### 8.3 CSS 动画

使用 Tailwind 内置的 `animate-in` 类（来自 `tw-animate-css`）：

```html
<div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
```

不需要额外的动画库就能实现平滑的页面切换。

### 8.4 时间线 CSS

时间线的竖线用绝对定位 + border 实现：

```html
<div className="relative pl-8">
  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/60" />
  <!-- 每个日期节点 -->
  <div className="flex items-center gap-3 -ml-8">
    <div className="h-2.5 w-2.5 rounded-full bg-primary/60 ring-4 ring-background" />
    <span>日期标签</span>
  </div>
</div>
```

`ring-4 ring-background` 让圆点看起来像"嵌在"时间线上。

### 8.5 决策反馈闭环

用户可以对 Agent 的决策进行反馈：

```
Agent 生成决策 (status: pending)
        │
        ├── 用户点击「采纳」→ status: executed
        │
        └── 用户点击「拒绝」→ status: rejected
```

这会更新 `AgentDecision` 表的 status 字段，后续可以统计 Agent 的建议采纳率，用于优化 Prompt 和策略。

---

## 九、验证与测试

### 9.1 TypeScript 编译

```bash
npx tsc --noEmit
# 预期：除 7 个预存错误外，新增代码 0 错误
```

### 9.2 服务器运行

```bash
npx next dev
# 服务器正常启动 ✅
```

### 9.3 如何手动测试

1. **测试教练面板**：
   - 登录后访问 `http://localhost:3000/agent`
   - 应该看到 4 个 Tab（教练面板 / 通知中心 / 决策记录 / 工作台）
   - 默认显示"教练面板"
   - 如果之前没有运行过 Agent，会显示"AI 教练待命"引导卡片
   - 点击"立即分析"按钮触发 Agent 运行

2. **测试通知中心**：
   - 切换到"通知中心" Tab
   - 如果 Agent 运行过，应该能看到通知列表
   - 点击通知卡片展开详情
   - 报告类通知会以 Markdown 格式渲染
   - 点击"全部已读"标记所有通知
   - 使用类型筛选按钮过滤

3. **测试决策记录**：
   - 切换到"决策记录" Tab
   - 查看决策时间线
   - 点击统计卡片快速筛选
   - 对 pending 状态的决策点击"采纳"或"拒绝"

4. **测试工作台**：
   - 切换到"工作台" Tab
   - 原有的 Agent 运行创建和管理功能保持不变
   - 输入目标 → 点击开始 → 查看计划草案 → 确认创建

5. **测试 Tab 切换**：
   - 在 4 个 Tab 之间切换
   - 应该有 fade + slide 过渡动画
   - 激活的 Tab 有绿色高亮 + 阴影

---

## 十、设计对照：大厂设计哲学

### 10.1 Linear 风格

- **暗色主题**：纯黑/深绿背景（非纯黑，而是 `#0c1f19` 墨绿）
- **微妙的边框**：`border-border/60` 而非明显的边框
- **任务导向**：每个 Tab 解决一个明确的任务
- **进度指示器**：统计数字 + 趋势箭头

### 10.2 Vercel 风格

- **毛玻璃效果**：`.glass-panel` + `backdrop-blur`
- **几何装饰**：`.bg-grid` 背景网格
- **以内容为中心**：大量留白，减少视觉噪音
- **暗绿渐变**：背景使用墨绿色调而非纯黑

### 10.3 Stripe 风格

- **信息层级清晰**：标题 → 摘要 → 详情 → 操作
- **友好的空状态**：图标 + 引导文案（而非空白页面）
- **分类系统**：Pill 按钮筛选，直观且易于操作

---

## 十一、下一步（Phase 5）

Phase 5 将进行优化和高级功能：

- MCP Server 支持
- WebSocket 实时通知推送
- 多 Agent 协作
- 性能优化和缓存策略
