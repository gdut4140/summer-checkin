#!/bin/sh
# 不需要 Prisma CLI，直接等 MySQL 健康后启动即可
# docker-compose 的 depends_on + healthcheck 已经保证 MySQL 就绪
exec node server.js
