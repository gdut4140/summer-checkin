#!/bin/sh
# 启动 WebSocket sidecar（后台）再启动 Next.js 主进程（前台）
# 依赖 depends_on + healthcheck 保证 Postgres 就绪
node node_modules/tsx/dist/cli.mjs server/index.ts &
exec node server.js
