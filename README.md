<div align="center">

<img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white&labelColor=000" alt="Next.js 16" />
<img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black&labelColor=20232A" alt="React 19" />
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=2359" alt="TypeScript 5" />
<img src="https://img.shields.io/badge/Prisma-5-2D3748?style=for-the-badge&logo=prisma&logoColor=white&labelColor=1A202C" alt="Prisma 5" />
<img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white&labelColor=0B1120" alt="Tailwind v4" />
<img src="https://img.shields.io/badge/DeepSeek-AI-4F46E5?style=for-the-badge&logo=openai&logoColor=white&labelColor=1E1B4B" alt="DeepSeek AI" />

</div>

<br />

<h1 align="center">
  🌞 Summer Checkin
  <br />
  <sub>记录你的暑假学习之旅 📚✨</sub>
</h1>

<p align="center">
  <b>每日打卡</b> · <b>学习计划</b> · <b>GitHub 热力图</b> · <b>AI 学习助手</b> · <b>排行榜</b>
</p>

<p align="center">
  一个为暑假学习量身打造的 <b>全栈 Web 应用</b>——<br />
  帮你追踪每一天的学习进度，让努力变得<b>可量化、可回顾、可炫耀</b> 🎯
</p>

<br />

---

## ✨ 为什么选择 Summer Checkin？

| | |
|---|---|
| 🎯 **目标驱动** | 创建学习计划，设定科目与时长目标，告别无目的学习 |
| 📸 **每日打卡** | 记录学习内容、时长、心情，支持上传学习截图 |
| 🔥 **连续打卡** | 保持每日 check-in，积累连续打卡天数，解锁稀有勋章 |
| 📊 **多维统计** | 日 / 周 / 月趋势图表 + 学科分布饼图，一目了然 |
| 🗺️ **学习热力图** | GitHub 贡献图风格，一整年的学习轨迹尽收眼底 |
| 🏆 **排行榜** | 周榜 / 月榜 / 总榜，看看你在所有学习者中的排名 |
| 🤖 **AI 学习助手** | DeepSeek 驱动，个性化学习建议、每日总结、智能答疑 |
| 🏅 **成就勋章** | 达成里程碑自动获得，让坚持变得有回报 |
| 🌙 **深色模式** | 支持亮色 / 深色 / 跟随系统，保护你的眼睛 |

---

## 🖼️ 页面一览

```
🏠  首页 Landing    →  产品介绍 + CTA
🔐  登录 / 注册      →  Better Auth 邮箱密码登录
📋  仪表盘 Dashboard  →  今日统计、本周趋势、快捷操作
✏️  打卡 Checkin     →  记录学习内容、时长、心情、截图
📅  日历 Calendar    →  GitHub 风格年度学习热力图
📊  统计 Statistics  →  日 / 周 / 学科多维图表
📝  计划 Plans       →  创建和管理学习计划，追踪进度
🏆  排行榜 Ranking    →  学习时长排行榜（周 / 月 / 总）
🤖  AI 助手          →  DeepSeek 智能对话，历史记录保存
👤  个人主页 Profile  →  个人信息、统计、勋章、动态
⚙️  设置 Settings    →  个人资料 · 修改密码 · 主题切换
```

---

## 🧰 技术栈

| 类别 | 技术 | 说明 |
|---|---|---|
| 🖥️ 框架 | **Next.js 16** + **React 19** | App Router, RSC, Server Actions |
| 🎨 样式 | **Tailwind CSS v4** + **shadcn/ui** | 原子化 CSS + 高质量组件库 |
| 🎬 动画 | **Motion** (Framer Motion) | 丝滑的页面动效 |
| 🗄️ ORM | **Prisma 5** | 类型安全的数据库操作 |
| 🐬 数据库 | **MySQL** | 稳定可靠的关系型数据库 |
| 🔐 认证 | **Better Auth** | 邮箱密码登录，Session 管理 |
| 🤖 AI | **DeepSeek** | OpenAI 兼容 API，中文友好 |
| 📈 图表 | **Recharts** | React 原生图表库 |
| ✅ 表单 | **React Hook Form** + **Zod** | 高性能表单 + 类型校验 |
| 🎭 图标 | **Phosphor Icons** + **Lucide** | 双图标库，风格统一 |
| 🔔 通知 | **Sonner** | 优雅的 Toast 通知 |
| 🌓 主题 | **next-themes** | 亮色 / 深色 / 系统自适应 |

---

## 🚀 快速开始

### 📋 前置要求

- **Node.js** ≥ 18
- **MySQL** ≥ 8.0
- **npm** / **pnpm** / **yarn** / **bun**

### ⚙️ 环境配置

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd summer-checkin

# 2. 安装依赖
npm install
```

```bash
# 3. 配置环境变量
cp .env.local.example .env.local
```

编辑 `.env.local`：

```env
# ── 数据库 ──
DATABASE_URL="mysql://user:password@localhost:3306/summer_checkin"

# ── Better Auth ──
BETTER_AUTH_SECRET="your-secret-key-here"
BETTER_AUTH_URL="http://localhost:3000"

# ── DeepSeek AI ──
DASHSCOPE_API_KEY="sk-your-deepseek-api-key"
DASHSCOPE_MODEL="deepseek-chat"
```

### 🗄️ 初始化数据库

```bash
# 生成 Prisma Client
npx prisma generate

# 推送数据库结构
npx prisma db push

# （可选）填充种子数据
npx prisma db seed
```

### 🏃 启动开发服务器

```bash
npm run dev
```

打开 [**http://localhost:3000**](http://localhost:3000) 开始使用 🎉

---

## 📁 项目结构

```
src/
├── app/
│   ├── (auth)/                  # 🔐 认证页面
│   │   ├── login/page.tsx       #    登录
│   │   └── register/page.tsx    #    注册
│   ├── (dashboard)/             # 📋 仪表盘（需登录）
│   │   ├── dashboard/page.tsx   #    仪表盘首页
│   │   ├── checkin/page.tsx     #    每日打卡
│   │   ├── calendar/page.tsx    #    学习热力图
│   │   ├── statistics/page.tsx  #    数据统计
│   │   ├── plans/page.tsx       #    学习计划
│   │   ├── plans/[id]/page.tsx  #    计划详情
│   │   ├── ranking/page.tsx     #    排行榜
│   │   ├── ai/page.tsx          #    AI 助手
│   │   ├── profile/page.tsx     #    个人主页
│   │   └── settings/page.tsx    #    设置
│   ├── api/
│   │   ├── ai/route.ts          #    AI 对话 API
│   │   └── auth/[...all]/route.ts # 认证 API
│   ├── layout.tsx               #   根布局
│   └── page.tsx                 #   Landing 首页
├── components/                  # 🧩 组件
│   ├── ui/                      #    shadcn/ui 基础组件
│   ├── landing/                 #    首页板块 (Hero, Features…)
│   ├── dashboard/               #    仪表盘组件
│   ├── checkin/                 #    打卡表单 & 心情选择器
│   ├── calendar/                #    热力图组件
│   ├── statistics/              #    统计图表
│   ├── plans/                   #    计划卡片 & 表单
│   ├── ranking/                 #    排行榜表格
│   ├── ai/                      #    AI 聊天界面
│   ├── profile/                 #    个人主页组件
│   ├── settings/                #    设置表单
│   └── layout/                  #    顶部导航栏
├── lib/                         # 📚 工具库
│   ├── auth.ts                  #    Better Auth 配置
│   ├── auth-client.ts           #    客户端 Auth SDK
│   ├── auth-utils.ts            #    requireAuth / getCurrentUser
│   ├── prisma.ts                #    Prisma 单例
│   ├── deepseek.ts              #    DeepSeek AI 封装
│   ├── validations.ts           #    Zod 校验规则
│   ├── constants.ts             #    常量定义
│   └── utils.ts                 #    通用工具函数
└── types/                       # 🏷️  TypeScript 类型定义
```

---

## 🗃️ 数据库模型

```mermaid
erDiagram
    User ||--o{ Session : has
    User ||--o{ Account : has
    User ||--o{ Plan : creates
    User ||--o{ Checkin : writes
    User ||--o{ StudyRecord : tracks
    User ||--o{ UserBadge : earns
    User ||--o{ AIHistory : chats
    Plan ||--o{ Checkin : contains
    Badge ||--o{ UserBadge : awarded_to

    User {
        string id PK
        string name
        string email UK
        string password
        string bio
        string image
        datetime createdAt
    }

    Checkin {
        string id PK
        string userId FK
        string planId FK
        string content
        float hours
        string subject
        string mood
        string screenshot
        datetime checkinDate
    }

    Plan {
        string id PK
        string userId FK
        string name
        string description
        string goal
        float targetHours
        string status
    }

    Badge {
        string id PK
        string name
        string description
        string icon
        string criteria
    }
```

---

## 🎮 功能详解

### 📝 每日打卡
记录当天学到的内容、投入的小时数、学习科目和心情 😊😐😢。支持上传学习截图作为记录证明。每天只能打卡一次，但可以编辑。

### 📋 学习计划
设定暑假学习目标，每个计划可以指定：
- 📛 计划名称 & 描述
- 🎯 目标总时长
- 📅 开始 / 结束日期
- 📊 自动计算完成进度

### 🗺️ 打卡日历
一整年的 GitHub 贡献图风格热力图，颜色越深 = 学得越久。一眼就能看出哪些日子在奋斗 🔥

### 🤖 AI 学习助手
基于 **DeepSeek** 大模型，你可以：
- 📖 让它总结你今天的学习内容
- 📝 帮你制定个性化学习计划
- 💡 解答学习中的疑难问题
- 🧠 分析你的学习模式给出改进建议

所有对话历史都会被保存，随时回顾 👀

### 📊 数据统计
- **每日趋势图**：最近 30 天学习时长折线图
- **每周汇总图**：最近 12 周学习时长柱状图
- **学科分布图**：各科目学习时间占比饼图
- **核心指标**：总时长、打卡天数、日均学习、最佳学科

### 🏆 排行榜
和所有用户比较学习时长！支持三种时间维度：
- 🔥 **本周排行**
- 📅 **本月排行**
- 👑 **总榜排行**

保持连续打卡还能冲击连胜榜首 ⚡

### 🏅 成就勋章
达成特定条件自动获得勋章，例如：
- 🌱 **初次打卡** — 完成第一次 check-in
- 🔥 **7 天连续** — 连续打卡 7 天
- 💯 **学习百小时** — 累计学习 100 小时
- 🎯 **计划大师** — 完成 3 个学习计划
- ……更多待你发现！

---

## 🔐 认证系统

基于 **Better Auth**，支持：
- ✉️ 邮箱 + 密码注册 / 登录
- 🍪 Session Cookie（30 天有效期）
- 🛡️ 路由中间件保护（未登录自动跳转）
- 🔑 修改密码

---

## 📦 可用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器 🚀 |
| `npm run build` | 构建生产版本 📦 |
| `npm run start` | 启动生产服务器 🏭 |
| `npm run lint` | 代码检查 🔍 |
| `npx prisma db push` | 推送数据库结构 🗄️ |
| `npx prisma db seed` | 填充种子数据 🌱 |
| `npx prisma studio` | 打开 Prisma 数据管理界面 🖥️ |

---

## 🚢 部署

推荐使用 **Vercel** 一键部署：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

也可以自行部署到任何支持 Node.js 的服务器：

```bash
npm run build
npm run start
```

⚠️ 记得在生产环境配置正确的 `DATABASE_URL` 和环境变量！

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！在开始之前：

1. 🍴 Fork 本项目
2. 🌿 创建你的功能分支 (`git checkout -b feat/amazing-feature`)
3. ✅ 提交你的改动 (`git commit -m 'feat: add amazing feature'`)
4. 📤 推送到分支 (`git push origin feat/amazing-feature`)
5. 🔀 打开一个 Pull Request

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

<br />

### 🌟 如果这个项目对你有帮助，请给它一个 Star！

Made with 💖 &nbsp;·&nbsp; Powered by ☕ &nbsp;·&nbsp; Have a great summer! 🌞

</div>
