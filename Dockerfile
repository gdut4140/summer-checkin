# ============================================================
# Stage 1: Build — 安装依赖 + Prisma 生成 + Next.js 构建
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

# 构建时系统依赖（Prisma 需要）
RUN apk add --no-cache libc6-compat

# 配置国内镜像加速（解决 Prisma 引擎下载问题）
RUN npm config set registry https://registry.npmmirror.com

# 复制依赖清单
COPY package.json package-lock.json ./

# 安装全部依赖（含 devDependencies，构建需要）
RUN npm ci

# 复制 Prisma 相关文件用于生成客户端
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/
COPY tsconfig.json ./

# 生成 Prisma Client（输出到 src/lib/generated/prisma/）
# prisma generate 只需 schema 不连数据库，给个占位 DATABASE_URL
RUN DATABASE_URL=mysql://dummy:dummy@localhost:3306/dummy npx prisma generate

# 复制全部源码
COPY . .

# 构建 Next.js（output: "standalone"）
# 构建时 Prisma adapter 需要 DATABASE_URL 环境变量，给个占位值即可
ENV DATABASE_URL=mysql://dummy:dummy@localhost:3306/dummy
RUN npm run build

# ============================================================
# Stage 2: Production — 仅包含运行时所需文件
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 知识库 PDF/Word 文本提取需要 Python（route.ts 调 python scripts/extract_*.py）
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages --no-cache-dir PyPDF2 python-docx && \
    ln -sf /usr/bin/python3 /usr/bin/python

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 从 builder 复制 standalone 输出
COPY --from=builder /app/.next/standalone ./

# 复制静态资源（standalone 不自动包含）
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制 Prisma 迁移文件（启动时需要执行 migrate deploy）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# 复制 Prisma CLI 完整依赖（standalone 不含 devDependencies，但启动时需要它们）
COPY --from=builder /app/node_modules ./node_modules

# 复制知识库文档（RAG 需要）
# 知识库为运行时 volume（compose 挂 knowledge_data 到 /app/knowledge），无需随镜像 COPY
RUN mkdir -p /app/knowledge

# 复制 WebSocket sidecar（独立进程，复用应用依赖 + ws）
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules/ws ./node_modules/ws

# 设置文件权限
RUN chown -R nextjs:nodejs /app

# 复制入口脚本
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
