# Step 5: Phase 5 简化版 — 通知铃铛 + 记忆优化 + 仪表板卡片

## 概述

Phase 5 原计划是 MCP Server + WebSocket 通知 + 多 Agent。这三样对一个**个人学习工具**来说太重了：

- **MCP Server**：没有外部工具需要暴露，不需要
- **WebSocket 通知**：cron 每天跑一次，WebSocket 保持长连接是浪费
- **多 Agent**：单用户场景下单 Agent 足够，多 Agent 只会增加复杂度和 token 消耗

实际实现的三个实用改进：

| 改进 | 效果 |
|---|---|
| 顶部通知铃铛 | 用户在任何页面都能看到通知，不用去 `/agent` |
| 记忆混合检索 | 重要记忆不会被新记忆挤出上下文窗口 |
| 仪表板教练卡片 | 首页直接看到 AI 教练最新消息 |

---

## 一、顶部通知铃铛

### 1.1 文件：`src/components/layout/notification-bell.tsx`

### 1.2 实现

```
┌──────────────────────────────────────────────┐
│  Summer Checkin   首页 打卡 计划  [🔔3] 🔍  👤 │  ← TopNav
│                                              │
│  点击铃铛 → Popover 弹出                       │
│  ┌──────────────────────────┐                │
│  │ 消息通知          3条未读  │                │
│  │ ─────────────────────── │                │
│  │ 💬 想跟你说              │                │
│  │ 今天状态不错，继续保持...   │                │
│  │ 5分钟前                  │                │
│  │ ─────────────────────── │                │
│  │ ⏰ 别忘了哦              │                │
│  │ 今天还有算法任务未完成     │                │
│  │ 2小时前          ●       │                │
│  │ ─────────────────────── │                │
│  │ 📋 学习小结              │                │
│  │ 下午好，这是你今天的...    │                │
│  │ 昨天                    │                │
│  │ ─────────────────────── │                │
│  │       查看全部 →         │                │
│  └──────────────────────────┘                │
└──────────────────────────────────────────────┘
```

### 1.3 关键设计

- **30 秒轮询**：`setInterval(fetchUnread, 30000)` 每半分钟刷新未读数
- **点击即已读**：点击通知自动调用 `PATCH /api/notifications/[id]` 标记已读
- **未读红点**：未读通知有蓝色小圆点 + 左侧浅蓝背景
- **Badge 计数**：铃铛右上角绿色圆形 badge，超过 99 显示 "99+"
- **空状态**：没有通知时显示铃铛图标 + "暂无通知"

### 1.4 接入 TopNav

在 TopNav 桌面端右侧区域添加 `<NotificationBell />`，位置在搜索按钮之前：

```
[🔔] [🔍 搜索] [Agent 工作台] [AI 助手] [👤 菜单]
```

---

## 二、记忆混合检索

### 2.1 问题

之前的 `getRelevantMemories` 只按 `createdAt DESC` 排序，取最近 20 条：

```
准备字节前端面试 (importance=0.9, 30天前)  ← 被挤出 top 20！
今天午饭吃了面   (importance=0.2, 2小时前) ← 排在前面
```

核心目标因为创建时间久远，被大量低价值的近期记忆挤出上下文窗口。

### 2.2 方案

改成**混合评分**：拉大候选池 → 计算综合得分 → 取 top N。

```
候选池 = 最近40条（按时间） ∪ 最重要10条（按重要性） → 去重

对每条记忆计算：
  score = importance × 0.6 + recencyScore × 0.4

其中 recencyScore 是时间衰减函数：
  今天     → 1.0
  7天前    → 0.77
  15天前   → 0.5
  30天前+  → 0.0

按 score 降序，取前 N 条
```

### 2.3 效果对比

| 场景 | 旧逻辑 | 新逻辑 |
|---|---|---|
| 30天前的核心目标(0.9) | 被挤出 top 20 ❌ | score=0.6×0.9+0.4×0=0.54，排在前列 ✅ |
| 2小时前的流水账(0.2) | 排在前面 | score=0.6×0.2+0.4×1.0=0.52，排在核心目标后面 |
| 昨天的重要偏好(0.7) | 可能被挤出 | score=0.6×0.7+0.4×0.97=0.81，排最前 ✅ |

### 2.4 文件改动

`src/lib/memory.ts`：重写 `getRelevantMemories`，新增候选池合并和评分的逻辑。`getImportantMemories` 保持不变（给需要纯按重要性排序的场景用）。

---

## 三、仪表板 AI 教练卡片

### 3.1 文件：`src/components/dashboard/coach-card.tsx`

### 3.2 设计

在仪表板页面的 Hero 区域和图表区域之间，插入一张窄卡片：

```
┌──────────────────────────────────────────────────┐
│ 🧠 AI 教练    8月4日 09:00                        │
│ ✅ 今天已经连续打卡 7 天了，继续保持！        →   │
└──────────────────────────────────────────────────┘
```

### 3.3 实现要点

- **Server Component**：卡片是服务端组件，直接查 `agentRun` 表取最新数据
- **条件渲染**：如果没有任何 agent 运行过（新用户），返回 `null` 不显示
- **点击跳转**：整个卡片是可点击的 Link，跳转到 `/agent`
- **状态 emoji**：根据 agent 分析的状态显示对应 emoji（✅/⚠️/🔧/🚨）
- **hover 效果**：轻微放大 + 阴影 + 箭头微移动

---

## 四、文件清单

### 新增文件

```
src/components/layout/notification-bell.tsx  — 通知铃铛组件
src/components/dashboard/coach-card.tsx       — 仪表板教练卡片
```

### 修改文件

```
src/components/layout/top-nav.tsx             — 嵌入 NotificationBell
src/lib/memory.ts                            — 重写 getRelevantMemories
src/app/(dashboard)/dashboard/page.tsx        — 嵌入 CoachCard
```

---

## 五、关键学习点

### 5.1 轮询 vs WebSocket

对于通知这种**低频事件**（每天几条通知），30 秒轮询是最优解：

| 方案 | 复杂度 | 实时性 | 资源 |
|---|---|---|---|
| 30s 轮询 | 低（setInterval + fetch） | 最多 30s 延迟 | 极低 |
| SSE | 中（需要 route + EventSource） | 实时 | 低 |
| WebSocket | 高（需要 ws server） | 实时 | 高 |

用户的 cron 每天跑一次，通知的产生频率极低。30 秒轮询的延迟在用户体验上完全感知不到，但实现简单得多。

### 5.2 记忆评分公式的设计

`score = importance × 0.6 + recencyScore × 0.4`

- **0.6 给重要性**：因为高重要性记忆（如学习目标）即使时间久远也应该保留
- **0.4 给时间**：给新记忆一定的优势，但不能让它们盖过重要记忆
- **时间衰减用线性**：比指数衰减更温和，30 天内的记忆都有一定的时效分值

这个权重比例可以根据实际效果调整。比如如果发现太多旧记忆占据上下文，可以降低 importance 权重。

### 5.3 Server Component 的好处

`CoachCard` 是服务端组件，直接在数据库查询，不需要额外的 API 路由：

```typescript
// 在 Server Component 中直接查数据库
const latestRun = await prisma.agentRun.findFirst({ ... });
```

对比 Client Component 需要 `useEffect` + `fetch` + API route，Server Component 更简单且性能更好。

---

## 六、测试

### 6.1 通知铃铛

1. 确保至少有 1 条未读通知（如果没有，先触发一次 cron：在浏览器控制台 `fetch("/api/agent/cron/daily")`）
2. 刷新页面，TopNav 右上角应该出现铃铛图标 + 绿色数字 badge
3. 点击铃铛，弹出通知列表
4. 点击一条未读通知，badge 数字应该减 1
5. 点击"查看全部 →"，跳转到 `/agent`

### 6.2 记忆检索

1. 在数据库查看当前记忆：`SELECT content, importance, created_at FROM usermemory ORDER BY created_at DESC LIMIT 20;`
2. 确认核心目标类记忆（importance ≥ 0.8）即使创建时间较久，也能通过新算法排在前列
3. 与 AI 对话时观察系统提示词中注入的记忆是否包含核心目标

### 6.3 仪表板卡片

1. 访问首页 `/dashboard`
2. 在 Hero 区域和图表之间应该出现 AI 教练卡片
3. 如果没有显示（新用户无 agent 运行记录），先去 `/agent` 点"立即分析"
4. 点击卡片跳转到 `/agent`
