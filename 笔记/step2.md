# Step 2: Memory 升级 + AgentDecision 决策追溯

> 对应进阶路线 Phase 2：Memory 分类/importance/confidence + AgentDecision 模型

## 一、这次做了什么

升级了两块基础设施，让 Agent 的"记忆"更智能、"决策"可追溯。

### 变更清单

| 文件 | 操作 | 关键变更 |
|------|------|---------|
| `prisma/schema.prisma` | 修改 | UserMemory 新增 type/importance/confidence/lastUsed；新增 AgentDecision 模型 |
| `src/lib/memory.ts` | 重写 | 记忆分类细化、AI 打分、按重要性查询、touchMemories |
| `src/lib/agent/decisions.ts` | 新建 | AgentDecision CRUD + 统计服务 |
| `src/lib/agent/runtime.ts` | 修改 | executeAction 后自动创建 AgentDecision 记录 |
| `src/lib/agent/index.ts` | 修改 | 新增 decisions 服务导出 |
| `src/types/index.ts` | 修改 | 新增 MemoryInfo/DecisionInfo 等类型 |

---

## 二、核心设计：记忆的"质量评分"体系

### 2.1 为什么需要 importance 和 confidence？

旧版记忆系统的问题：

```
旧版：
  content: "准备字节前端面试"
  category: "goal"

问题：
  - 所有记忆一视同仁，Agent 无法区分"核心目标"和"琐碎事实"
  - 不知道这条记忆有多可靠（用户随口说的？还是反复强调的？）
  - 记忆越积越多，不知道哪些该优先使用
```

升级后：

```prisma
model UserMemory {
  type       String   // goal | habit | preference | skill | weakness | fact
  importance Float    // 0-1 重要性评分
  confidence Float    // 0-1 置信度评分
  lastUsed   DateTime? // 上次被检索的时间
}
```

**importance** — 这条记忆对学习决策有多重要：
- `0.9-1.0`：核心目标/关键弱点（直接影响计划）
- `0.7-0.8`：重要偏好/技能（影响方式）
- `0.5-0.6`：一般习惯（参考价值）
- `0.3-0.4`：零散事实（也许有用）
- `0.1-0.2`：临时信息（价值低）

**confidence** — AI 对自己的判断有多确定：
- `1.0`：用户非常明确地说出
- `0.8`：比较明确但未完全展开
- `0.5`：简略提及
- `0.3`：不太确定

### 2.2 这个设计的实际价值

Agent Runtime 调用 `getImportantMemories` 时：

```
场景：用户目标是"准备字节前端面试"，但最近7天全在学 Python

Agent 分析时获取 memories：
  - 🎯 [goal, importance=0.95] 准备字节前端面试  ← 系统看到这条！
  - 📋 [fact, importance=0.3] 用户喜欢吃火锅

Agent 的 Analyze 结果：
  finding: "学习内容与目标严重偏离 — 目标是前端面试，但最近全在学 Python"
  action: SEND_REMINDER "你的学习目标还是前端面试吗？最近似乎一直在学 Python"
```

**面试可以这样说**：
> "记忆系统不只是存储，关键是让 AI 知道哪些信息重要、哪些可靠。importance 让 Agent 优先关注核心目标，confidence 避免过度依赖不确定的记忆。这和 RAG 的检索排序是同一个思路——不是所有数据都等价，需要打分和筛选。"

---

## 三、AgentDecision — 决策追溯系统

### 3.1 为什么需要

Agent 会自动干预用户的学习计划（调整优先级、创建任务、发送提醒），这些干预需要：
- **可追溯**：查看过去 Agent 做了哪些干预
- **可评估**：统计干预的采纳率
- **可优化**：分析哪些决策类型效果好，改进 prompt

### 3.2 数据模型

```prisma
model AgentDecision {
  id        String
  userId    String
  runId     String?     // 关联到哪次 AgentRun
  type      String      // PLAN_ADJUST | REMINDER | ANALYSIS | TASK_CREATE
  reason    String      // 决策原因（"算法连续3天未完成"）
  action    Json        // 具体行动内容
  status    String      // executed | pending | rejected | failed
  feedback  String?     // 后续反馈（用户是否采纳）
}
```

### 3.3 生命周期

```
Agent 分析 → 生成 action → execute
                              │
                              ├── 成功 → createDecision(status: "executed")
                              │            │
                              │   用户看到建议 → 采纳 → updateDecisionStatus("executed", "用户接受了提醒")
                              │   用户看到建议 → 忽略 → updateDecisionStatus("rejected", "用户未响应")
                              │
                              └── 失败 → createDecision(status: "failed")
```

**关键设计**：决策创建不阻塞 Agent 主流程

```typescript
// createDecision 内部 try-catch，失败只记日志不影响 Agent 循环
try {
  await createDecision({ ... });
} catch (error) {
  console.error("[Decision] 创建失败:", error);
  // 不 throw — Agent 继续执行
}
```

### 3.4 统计能力

```typescript
const stats = await getDecisionStats(userId);
// {
//   total: 45,               // 总共 45 次决策
//   byType: {                // 按类型分布
//     ANALYSIS: 20,
//     PLAN_ADJUST: 10,
//     REMINDER: 12,
//     TASK_CREATE: 3
//   },
//   byStatus: {              // 按状态分布
//     executed: 30,
//     rejected: 10,
//     pending: 5
//   },
//   recentRate: 75           // 最近7天采纳率 75%
// }
```

---

## 四、记忆的生命周期管理

### 4.1 touchMemories — 标记记忆被使用

```typescript
// 当 Agent 检索并使用某条记忆后
await touchMemories([memory1.id, memory2.id]);
// → 更新 lastUsed = now()
```

作用：
- **淘汰冷数据**：长期未使用的低重要性记忆可以清理
- **重新激活**：长期未使用但高重要性的记忆（如目标）可以提醒 Agent
- **数据驱动优化**：统计哪些类型的记忆最常用

### 4.2 智能去重

```typescript
// 旧版：只按 content 去重
const existingContents = new Set(existing.map(m => m.content));

// Phase 2：按 type + content 去重
const existingSet = new Set(existing.map(m => `${m.type}::${m.content}`));

// 同 type + 同 content → 更新 importance/confidence，不新增
if (existingSet.has(key)) {
  await prisma.userMemory.updateMany({
    where: { userId, type: item.type, content: item.content },
    data: { importance: item.importance, confidence: item.confidence, lastUsed: new Date() },
  });
}
```

### 4.3 按重要性查询

```typescript
// Agent 分析时用：获取最重要的记忆（而非最近记忆）
const important = await getImportantMemories(userId, 10);

// 按类型筛选：只获取目标相关记忆
const goals = await getMemoriesByType(userId, "goal");

// 对话时用：获取最近记忆（保持原有行为）
const recent = await getRelevantMemories(userId, 20);
```

---

## 五、从 category 到 type 的升级

| 旧版 category | 新版 type | 区别 |
|---|---|---|
| `preference` | `preference` | 保留 |
| `goal` | `goal` | 保留 |
| `skill` | `skill` | 保留 |
| `fact` | `fact` | 保留 |
| — | `habit` | **新增**：学习习惯（"喜欢早上学习"） |
| — | `weakness` | **新增**：薄弱环节（"算法较弱"） |

`habit` 和 `weakness` 的引入是因为 Agent 需要这两类信息来做规划：
- `weakness` → Agent 自动增加该科目的学习任务
- `habit` → Agent 根据习惯推荐最佳学习时间段

---

## 六、AI Prompt 升级要点

记忆提取 prompt 的核心变化：

```
旧版：提取 category（preference/goal/skill/fact）
新版：提取 type（6种）+ importance（0-1）+ confidence（0-1）

importance 评分标准被写进 prompt：
  "0.9-1.0: 核心目标/关键弱点"
  "0.7-0.8: 重要偏好/技能"
  ...

让 AI 而非代码规则来打分的原因：
  - AI 能从对话语义中判断信息的重要性
  - 规则只能基于关键词匹配，无法理解上下文
  - 例如："我随便学学" vs "我一定要进字节"
    两者都包含"学习目标"，但重要性完全不同
```

**面试可以这样说**：
> "记忆的 importance 和 confidence 评分由 AI 在提取时完成，而不是由规则引擎打分。因为重要性是语义层面的判断——一个目标有多重要取决于用户表达的强烈程度，关键词匹配无法区分'随便学学'和'一定要进字节'的差异。"

---

## 七、下一步（Phase 3 预览）

Phase 3 将实现：
- Notification 模型（独立于 AgentDecision）
- Cron 定时调度完善
- 自动生成周报
- Agent Center 前端页面

---

> **一句话总结**：Phase 2 给记忆系统加上了"质量评分"（importance/confidence）和"生命周期管理"（lastUsed），同时建立了 AgentDecision 让每次自主决策可追溯、可评估、可优化。
