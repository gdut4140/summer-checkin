# Summer Checkin：上下文工程与短期记忆实施任务

请基于当前 Summer Checkin 项目，实际实现一套轻量级的 AI Agent 上下文工程与短期记忆系统。

本次只改造：

1. 智能体页（Rainforest Explorer）
2. 计划工作台（Plan）
3. 文档工作台（Document）

不改造聊天室和每日分析 Agent。

## 一、项目现状

项目使用：

- Next.js App Router
- React
- TypeScript
- Vercel AI SDK
- Prisma
- PostgreSQL
- pgvector

当前已经存在：

- Conversation
- ConversationMessage
- UserMemory
- `/api/ai/route.ts`
- 智能体页 `rainforest-explorer.tsx`
- 工作台 `ai-chat-panel.tsx`

当前存在的问题：

1. 智能体页前端使用 `slice(-40)` 截断历史消息。
2. 工作台只发送最近 8 条纯文本消息。
3. 历史工具调用和工具结果没有完整参与后续模型上下文。
4. 没有滚动摘要机制，历史对话只能简单截断。
5. 没有会话级 AgentState。
6. 没有历史回溯工具。
7. 上下文组装逻辑需要统一。

请先检查实际代码和数据库结构，不要假设上述描述一定与当前代码完全一致。

## 二、总体设计

实现以下四个核心机制：

1. Context Builder：统一构建模型上下文。
2. Rolling Summary：滚动摘要，保存较早对话的短期记忆。
3. AgentState + Agent Status Bar：持久化当前会话状态，并注入动态状态。
4. History Retrieval：摘要遗漏重要信息时，允许 Agent 找回原始消息。

整体流程：

```text
用户发送消息
      ↓
读取 Conversation
      ↓
Scene Context Builder
      ↓
读取 UserMemory
      ↓
读取 AgentState
      ↓
检查是否需要压缩历史
      ↓
Context Builder
      ↓
System Context
+ Conversation Summary
+ Recent Messages
+ Current User Message
+ Agent Status Bar
      ↓
Vercel AI SDK
      ↓
LLM / Tool Calling
      ↓
保存完整原始对话
      ↓
更新 AgentState
```

注意：这是逻辑流程，不要求每个部分都成为独立的 LLM message。

## 三、AgentState：会话级短期记忆

新增 AgentState Prisma 模型，与 Conversation 建立一对一关系。

建议结构：

```ts
interface AgentState {
  id: string;
  conversationId: string;

  // 滚动摘要
  summary: string;

  // 当前任务的重要信息
  workingMemory: WorkingMemoryItem[];

  // 当前任务执行进度
  todoList: TodoItem[];

  // 已压缩到的最后一条原始消息
  compressedThroughMessageId: string | null;

  // 并发更新控制
  version: number;

  createdAt: Date;
  updatedAt: Date;
}
```

类型定义：

```ts
interface WorkingMemoryItem {
  content: string;
  importance: "high" | "medium" | "low";
}

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}
```

要求：

- AgentState 与 Conversation 一对一。
- 通过 conversationId 查询对应状态。
- 创建 Conversation 时初始化 AgentState，或首次请求时安全地懒初始化。
- 刷新页面、重新进入会话时可以恢复。
- 不同 Conversation 的状态完全隔离。
- AgentState 不保存完整文档和计划。
- UserMemory 保持现有逻辑，不要替换。
- 对 workingMemory 和 todoList 设置合理的数量限制。

## 四、Rolling Summary：滚动摘要

采用替换式摘要，不采用每轮追加摘要。

### 1. 压缩触发

第一版采用简单的消息窗口策略：

- 最近保留 20 条原始消息。
- 更早的消息进入压缩流程。
- 后续可以再优化成 Token 预算触发。

注意：20 条只是初始配置，应集中管理，方便调整。

### 2. 压缩流程

每次压缩：

1. 读取 AgentState.summary。
2. 读取上次压缩位置之后的新增历史消息。
3. 将旧摘要和新增消息交给 LLM。
4. 生成一份新的完整摘要。
5. 覆盖旧的 summary。
6. 更新 compressedThroughMessageId。

核心逻辑：

```ts
const newSummary = await compressHistory({
  previousSummary: agentState.summary,
  newMessages: messagesToCompress,
});

await updateAgentState({
  summary: newSummary,
  compressedThroughMessageId: lastCompressedMessage.id,
});
```

### 3. 摘要内容要求

摘要应保留：

- 用户目标和当前任务。
- 已确定的重要决策。
- 关键数字、参数和技术方案。
- 用户明确提出的约束。
- 尚未解决的问题。

摘要必须简洁，避免逐句复述。

### 4. 重要约束

- 原始 ConversationMessage 永远保留。
- 不删除、不覆盖原始消息。
- 摘要失败时保留旧摘要。
- 不能重复压缩已经处理过的消息。
- 不能把 assistant tool call 和 tool result 拆开压缩。
- 不能把不完整的工具调用记录当成正常对话。
- 更新摘要和压缩边界时应保证一致性。
- 并发请求不能导致摘要覆盖或压缩边界错乱。

如果需要增加锁或乐观锁，请优先采用项目现有数据库实践。

## 五、Context Builder：统一组装上下文

新增统一 Context Builder，供智能体页、计划工作台、文档工作台使用。

不要让三个入口各自维护一套历史截断和上下文拼装逻辑。

### 1. System Context

由以下内容组成：

```text
System Prompt
+ Scene Context
+ UserMemory
```

System Prompt 保存稳定的行为规则。

Scene Context 是当前业务数据。

UserMemory 是现有的跨会话长期记忆。

### 2. Conversation Context

由以下内容组成：

```text
Conversation Summary
+ Recent Messages
+ Current User Message
```

其中：

- Conversation Summary 来自 AgentState.summary。
- Recent Messages 是最近的原始对话。
- Current User Message 是当前用户本轮真正输入。

不要将当前用户消息重复放入历史消息。

### 3. Runtime Context

由以下内容组成：

```text
Agent Status Bar
```

在每次模型请求前动态生成。

### 4. 组装要求

- System Prompt 尽量保持稳定。
- 不要每轮把动态状态拼接进静态 System Prompt。
- 摘要放在近期对话之前。
- 状态栏放在模型上下文末尾。
- 根据当前 Vercel AI SDK 版本正确处理消息结构。
- 保留必要的 tool-call 和 tool-result parts。
- 不要简单地将所有消息转换成纯文本。
- 不允许破坏 assistant tool call 与 tool result 的配对关系。
- 如果需要将摘要和状态栏作为独立消息注入，必须保证它们不会被误认为用户真实输入。
- 如果使用 AI SDK 的消息转换接口，优先沿用项目已有协议和转换方式。

## 六、Scene Context：当前业务数据

Scene Context 不需要存进 AgentState。

直接复用现有：

```ts
Conversation.surface
Conversation.refId
```

根据当前场景查询业务数据库。

例如：

```ts
if (conversation.surface === "plan") {
  // 根据 refId 查询当前 Plan
}

if (conversation.surface === "doc") {
  // 根据 refId 查询当前 Document
}
```

要求：

- 每次请求获取最新业务数据。
- 必须验证当前用户对业务数据的访问权限。
- 不要把完整业务数据复制到 AgentState。
- 不要把完整文档内容塞进 Agent Status Bar。
- 保持原有计划和文档上下文功能。
- 暂时不重构文档 RAG 系统。
- 智能体页没有绑定具体业务对象时，可以没有 Scene Context。

## 七、Agent Status Bar：动态状态栏

新增 Status Builder。

从 AgentState 中读取：

- workingMemory
- todoList

生成结构化的动态状态消息。

例如：

```text
<agent_status>
当前场景：文档编辑

当前任务：修改学习计划

任务进度：
- 已完成：分析原文
- 进行中：调整学习阶段
- 待完成：检查修改结果

重要约束：
- 保留原有文档结构
- 不要删除已确认内容
</agent_status>
```

要求：

- 状态栏由代码生成，不要每轮调用 LLM 重新统计全部历史。
- 每次请求动态生成。
- 采用每轮替换策略。
- 不把历史状态栏一直追加到消息列表。
- 放在模型上下文末尾。
- 不重复注入滚动摘要。
- 不要把完整业务文档放进状态栏。

注意区分：

- Summary：之前发生了什么。
- Status Bar：当前正在做什么。
- AgentState：保存短期记忆和任务状态。

## 八、History Retrieval：历史原文回溯

新增工具：

```ts
searchConversationHistory({
  query: string,
  limit?: number
});
```

当 Agent 发现当前摘要缺少具体信息时，可以调用该工具搜索原始对话。

例如：

用户询问之前确定的 RAG Top-20 和 Top-5 参数，但摘要没有记录具体数值。

Agent 应检索历史原文，而不是猜测。

### 实现要求

- 优先复用现有 PostgreSQL 和 pgvector 能力。
- 第一版优先实现简单可靠的全文搜索。
- 如果已有 BM25 或向量检索能力，可以复用。
- 暂时不引入新的复杂检索框架。
- 只搜索当前 Conversation。
- 必须校验用户权限。
- 返回最多 5 条相关消息。
- 返回 messageId、role、content、createdAt。
- 不允许跨用户、跨会话访问。
- 无结果时明确返回空结果。

如果当前消息数据包含复杂的 tool parts，应正确提取可检索内容，但不能因此破坏原始数据。

### Agent 行为规则

在系统提示词中增加：

当用户询问历史对话中的具体参数、原话、代码、决策或其他细节，而当前上下文和摘要无法提供足够依据时，优先调用 searchConversationHistory 检索原始消息，不允许凭空猜测。

## 九、压缩和历史回溯的边界

必须保证：

```text
ConversationMessage
    = 完整原始对话，永久保留

AgentState.summary
    = 较早对话的压缩摘要，可以不断替换

AgentState.workingMemory
    = 当前任务的重要信息

AgentState.todoList
    = 当前任务进度

Agent Status Bar
    = 每次请求动态生成的状态消息
```

压缩不能等于删除。

历史回溯必须能够找到已经被压缩的原始消息。

## 十、两个入口接入

### 智能体页

检查 `rainforest-explorer.tsx`：

- 移除原有单纯依赖 slice(-40) 的历史上下文策略。
- 接入统一 Context Builder。
- 支持 AgentState 恢复。
- 支持滚动摘要。
- 支持历史回溯工具。

### 计划和文档工作台

检查 `ai-chat-panel.tsx`：

- 移除只发送最近 8 条纯文本的限制。
- 接入统一 Context Builder。
- 根据 surface/refId 加载 Scene Context。
- 复用相同的 AgentState、摘要压缩和状态栏机制。
- 保留原有计划和文档修改功能。

两个入口允许有不同的工具权限和场景配置，但不应维护两套独立的上下文工程逻辑。

## 十一、并发与安全

重点处理：

1. 两个请求同时触发摘要压缩。
2. 摘要生成成功但数据库更新失败。
3. 压缩过程中用户又发送新消息。
4. 用户访问其他用户的 Conversation。
5. 历史检索跨会话读取数据。
6. 工具调用历史被错误截断。

要求：

- 使用数据库事务或乐观锁保障摘要和压缩边界一致。
- 必要时增加压缩锁或版本校验。
- 不要在压缩过程中删除原始数据。
- 不要因为压缩失败阻塞正常对话。
- 权限检查必须放在服务端。
- 对历史检索工具严格限制当前 conversationId。

## 十二、测试要求

至少测试：

1. 超过近期消息窗口后能够触发摘要压缩。
2. 第二次压缩会结合旧摘要和新增消息。
3. 第二次压缩会替换旧摘要，而不是追加。
4. 原始 ConversationMessage 不会被删除。
5. 最近原始消息能够正确进入模型上下文。
6. 工具调用和工具结果不会被拆开。
7. AgentState 在页面刷新后能够恢复。
8. 不同 Conversation 之间的状态相互隔离。
9. 计划工作台能够正确加载当前 Plan。
10. 文档工作台能够正确加载当前 Document。
11. 摘要缺少细节时，Agent 能通过工具找回原文。
12. 历史检索不能访问其他用户的消息。
13. 并发压缩不会覆盖更新后的摘要。
14. 原有流式输出和工具调用正常工作。

## 十三、实施步骤

请按以下顺序实际修改代码：

1. 检查现有代码、数据库结构和 AI SDK 版本。
2. 梳理当前两个入口的上下文构建流程。
3. 新增 AgentState Prisma 模型和迁移。
4. 实现 AgentState 的读写服务。
5. 实现 Context Compressor。
6. 实现 Context Builder。
7. 实现 Scene Context Builder。
8. 实现 Agent Status Bar。
9. 实现 searchConversationHistory 工具。
10. 接入智能体页。
11. 接入计划和文档工作台。
12. 补充测试并运行 typecheck、lint 和相关测试。

## 十四、开发约束

- 直接修改项目代码，不要只给设计文档。
- 优先复用现有代码和服务。
- 不引入 LangChain、LangGraph 等框架。
- 不重构 UserMemory。
- 不改造每日分析 Agent。
- 不改造聊天室。
- 不大规模修改无关文件。
- 不要为了满足方案而重复实现已有功能。
- 不要使用过时的 Vercel AI SDK API，先确认项目实际版本。
- 对涉及数据迁移的操作，先检查现有 Prisma Schema。
- 对任何不确定的架构问题，先检查代码再决定，不要凭空假设。

如果方案与现有架构冲突，请先说明最小调整方案，再实施。

## 十五、最终交付报告

完成后请汇报：

1. 修改和新增的文件。
2. AgentState 的最终数据结构。
3. Context Builder 的实际实现。
4. 滚动摘要的触发条件和压缩流程。
5. Agent Status Bar 的生成方式。
6. 历史原文回溯的实现方式。
7. 智能体页和工作台的接入情况。
8. 数据库迁移情况。
9. 测试和 typecheck、lint 结果。
10. 尚未实现的内容和已知限制。

请以实际代码为准，不要声称实现了尚未完成的功能。
你可以有自己的判断