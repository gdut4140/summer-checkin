# Summer Checkin

全栈学习打卡平台：每日打卡、学习计划、番茄钟专注、统计图表、AI 学习助手、知识库问答与多人聊天室。为假期和长期学习而设计，让努力变得可量化、可回顾。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

</div>

---

## 功能

### 每日打卡
- 记录学习内容、心情，支持上传截图
- 连续打卡天数统计，达成里程碑自动获得成就徽章

### 学习计划
- 任务制进度：进度 = 已完成任务 / 总任务
- 文档工作室：以 Markdown 撰写计划文档，AI 按文档自动拆分任务
- 计划、任务与打卡数据联动

### 专注与统计
- 番茄钟：25 / 45 / 60 分钟专注计时，完成自动记录
- 统计页：专注时长趋势（近 7 天）、学科分布、打卡日历

### AI 智能体
- 学习计划工作流：先分析你的学习数据，再生成个性化计划
- 知识库 RAG：上传 md / pdf / docx / txt，向量检索后基于文档回答
- 每日学习检查、进度追踪、个性化建议

### 多人聊天室
- WebSocket 实时群聊
- @AI 唤起聊天室好友，流式回复，支持 Markdown 渲染

### 其他
- 多场景主题（雨林 / 雪林 / 云间）自动切换配色
- Better Auth 注册 / 登录 / 会话管理

## 技术栈

- **Next.js 16**（App Router）、**React 19**、**TypeScript**
- **Prisma** + **PostgreSQL**（pgvector 向量检索）
- **Tailwind CSS v4**、Motion、Recharts
- **AI SDK**（OpenAI 兼容 API，默认 Agnes，可切换任意兼容服务商）
- **WebSocket**（`ws`）独立 sidecar 进程承载聊天室与 AI 流式回复

## 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL（建议使用 `pgvector/pgvector` 镜像，向量检索依赖 pgvector 扩展）

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env   # 填入真实 API Key 与数据库地址

# 3. 生成 Prisma Client
npx prisma generate

# 4. 初始化数据库（创建表 + 写入勋章种子数据）
npx prisma db push
npx prisma db seed

# 5. 启动
npm run dev        # 前端（端口 3000）
npm run ws:dev     # WebSocket sidecar（端口 3001，聊天室 + AI 依赖它）
```

> 数据库升级：本项目使用手写 SQL 迁移，文件位于 `prisma/*.sql`，已有数据库请按需执行对应文件。

### 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `DASHSCOPE_API_KEY` | AI 对话 API Key（OpenAI 兼容，默认 Agnes） |
| `DASHSCOPE_MODEL` | 对话模型（默认 `agnes-2.5-flash`） |
| `DASHSCOPE_BASE_URL` | 对话 API 地址 |
| `EMBEDDING_API_KEY` | 向量模型 API Key（默认阿里百炼） |
| `EMBEDDING_MODEL` | 向量模型 |
| `EMBEDDING_BASE_URL` | 向量 API 地址 |
| `BETTER_AUTH_SECRET` | 会话签名密钥（`openssl rand -base64 32`） |
| `BETTER_AUTH_URL` | 登录回调地址 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server Actions 加密密钥（`openssl rand -hex 32`） |

## 项目结构

```
├── src/
│   ├── app/                 # App Router 页面与 API 路由
│   │   ├── (auth)/          # 登录 / 注册
│   │   ├── (dashboard)/     # 打卡 / 计划 / 统计 / 设置等
│   │   └── api/             # 后端接口（chat / ai / knowledge / plans…）
│   ├── components/          # UI 组件（聊天室 / 专注室 / 智能体 / 统计…）
│   ├── lib/                 # 业务逻辑、AI 工具、RAG 检索、记忆
│   └── types/               # 共享类型
├── server/                  # WebSocket sidecar（聊天室 + AI 流式回复）
├── prisma/                  # Schema、种子数据、SQL 迁移
├── scripts/                 # 部署脚本、文档提取脚本
└── nginx/                   # 反向代理配置
```

## 部署（Docker）

```bash
# 设置环境变量后一键部署（前端 + WebSocket + PostgreSQL + Nginx）
docker compose up -d --build
```

部署时需提供 `DASHSCOPE_API_KEY`、`EMBEDDING_API_KEY`、`BETTER_AUTH_SECRET`、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 等环境变量。`BETTER_AUTH_URL` 应设置为服务器的公网地址。

> 注意：生产部署前请修改 `docker-compose.yml` 中的 PostgreSQL 默认密码。

## License

[MIT](./LICENSE)
