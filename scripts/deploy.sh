#!/bin/bash
set -e

# ============================================================
# Summer Checkin — 部署脚本（tar 导出上传，阿里云 ECS）
# 用法: ./scripts/deploy.sh [镜像标签]
# 示例: ./scripts/deploy.sh v1.0.0
#
# 流程: 构建 → 导出 tar → scp 上传 → 服务器 docker load + compose up
# 服务器: root@8.163.59.196（阿里云 ECS，可用 ECS_HOST/ECS_USER 覆盖）
# 上传后务必 md5 比对，见 DEPLOYMENT-NOTES.md 坑 5
# ============================================================

VERSION="${1:-latest}"
ECS_HOST="${ECS_HOST:-8.163.59.196}"
ECS_USER="${ECS_USER:-root}"

echo "=== Summer Checkin 部署 (版本: $VERSION → $ECS_USER@$ECS_HOST) ==="

# 构建镜像
echo "[1/4] 构建 Docker 镜像..."
docker build -t summer-checkin-app:$VERSION -f Dockerfile .
docker build -t summer-checkin-embedding:$VERSION -f Dockerfile.embedding .
echo "  ✅ 构建完成"

echo ""
echo "[2/4] 导出镜像 tar 包..."
docker save -o summer-checkin-app-$VERSION.tar summer-checkin-app:$VERSION
docker save -o summer-checkin-embedding-$VERSION.tar summer-checkin-embedding:$VERSION
echo "  ✅ 导出完成"
echo "  ⚠️ 大镜像导出/上传慢且易断，传完 md5 比对（见 DEPLOYMENT-NOTES.md 坑 5）"

echo ""
echo "[3/4] 上传到服务器..."
scp summer-checkin-app-$VERSION.tar $ECS_USER@$ECS_HOST:~/summer-checkin/
scp summer-checkin-embedding-$VERSION.tar $ECS_USER@$ECS_HOST:~/summer-checkin/
scp docker-compose.yml $ECS_USER@$ECS_HOST:~/summer-checkin/
scp -r nginx $ECS_USER@$ECS_HOST:~/summer-checkin/
scp .env $ECS_USER@$ECS_HOST:~/summer-checkin/
echo "  ✅ 上传完成"

echo ""
echo "[4/4] 服务器端操作:"
echo ""
echo "  ssh $ECS_USER@$ECS_HOST"
echo "  cd ~/summer-checkin"
echo "  docker load -i summer-checkin-app-$VERSION.tar"
echo "  docker load -i summer-checkin-embedding-$VERSION.tar"
echo "  docker compose up -d"
echo "  docker compose logs -f"

echo ""
echo "=== 完成 ==="
