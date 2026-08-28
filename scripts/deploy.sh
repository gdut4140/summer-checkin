#!/bin/bash
set -e

# ============================================================
# Summer Checkin — 部署脚本
# 用法: ./scripts/deploy.sh [镜像标签]
# 示例: ./scripts/deploy.sh v1.0.0
#
# 用法一: 直接 tar 导出上传（默认，无需镜像仓库）
#   ./scripts/deploy.sh --tar v1.0.0
#   然后 scp 镜像 tar 到服务器
#   当前服务器: 8.148.146.16（阿里云，免密 key ~/.ssh/deploy_hw）
#
# 用法二: 推送到镜像仓库（可选，需自建/自配 ACR）
#   设置环境变量: export REGISTRY=<你的阿里云 ACR 命名空间>
#   需要先登录: docker login -u <username> -p <password> <你的 ACR 地址>
# ============================================================

VERSION="${1:-latest}"
USE_TAR=false
ECS_HOST="${ECS_HOST:-}"
ECS_USER="${ECS_USER:-root}"

# 解析参数
if [ "$1" = "--tar" ]; then
  USE_TAR=true
  VERSION="${2:-latest}"
fi

echo "=== Summer Checkin 部署 (版本: $VERSION) ==="

# 构建镜像
echo "[1/4] 构建 Docker 镜像..."
docker build -t summer-checkin-app:$VERSION -f Dockerfile .
docker build -t summer-checkin-embedding:$VERSION -f Dockerfile.embedding .
echo "  ✅ 构建完成"

if [ "$USE_TAR" = true ]; then
  # ==========================================================
  # 方式一: 导出 tar 包
  # ==========================================================
  echo ""
  echo "[2/4] 导出镜像 tar 包..."
  docker save -o summer-checkin-app-$VERSION.tar summer-checkin-app:$VERSION
  docker save -o summer-checkin-embedding-$VERSION.tar summer-checkin-embedding:$VERSION
  echo "  ✅ 导出完成"

  echo ""
  echo "[3/4] 上传到服务器..."
  if [ -z "$ECS_HOST" ]; then
    echo "  ⚠️ 未设置 ECS_HOST，请手动上传:"
    echo ""
    echo "  scp summer-checkin-app-$VERSION.tar $ECS_USER@<你的ECS_IP>:~/summer-checkin/"
    echo "  scp summer-checkin-embedding-$VERSION.tar $ECS_USER@<你的ECS_IP>:~/summer-checkin/"
    echo "  scp docker-compose.yml $ECS_USER@<你的ECS_IP>:~/summer-checkin/"
    echo "  scp -r nginx $ECS_USER@<你的ECS_IP>:~/summer-checkin/"
    echo "  scp .env $ECS_USER@<你的ECS_IP>:~/summer-checkin/"
  else
    scp summer-checkin-app-$VERSION.tar $ECS_USER@$ECS_HOST:~/summer-checkin/
    scp summer-checkin-embedding-$VERSION.tar $ECS_USER@$ECS_HOST:~/summer-checkin/
    scp docker-compose.yml $ECS_USER@$ECS_HOST:~/summer-checkin/
    scp -r nginx $ECS_USER@$ECS_HOST:~/summer-checkin/
    scp .env $ECS_USER@$ECS_HOST:~/summer-checkin/
    echo "  ✅ 上传完成"
  fi

  echo ""
  echo "[4/4] 服务器端操作:"
  echo ""
  echo "  ssh $ECS_USER@$ECS_HOST"
  echo "  cd ~/summer-checkin"
  echo "  docker load -i summer-checkin-app-$VERSION.tar"
  echo "  docker load -i summer-checkin-embedding-$VERSION.tar"
  echo "  docker compose up -d"
  echo "  docker compose logs -f"
else
  # ==========================================================
  # 方式二: 推送到镜像仓库
  # ==========================================================
  REGISTRY="${REGISTRY:-}"
  if [ -z "$REGISTRY" ]; then
    echo ""
    echo "  ❌ 错误: 请设置 REGISTRY 或使用 --tar 模式"
    echo "  export REGISTRY=<你的阿里云 ACR 命名空间>"
    exit 1
  fi

  echo ""
  echo "[2/4] 标记镜像..."
  docker tag summer-checkin-app:$VERSION $REGISTRY/summer-checkin-app:$VERSION
  docker tag summer-checkin-embedding:$VERSION $REGISTRY/summer-checkin-embedding:$VERSION
  docker tag summer-checkin-app:$VERSION $REGISTRY/summer-checkin-app:latest
  docker tag summer-checkin-embedding:$VERSION $REGISTRY/summer-checkin-embedding:latest

  echo ""
  echo "[3/4] 推送到镜像仓库..."
  docker push $REGISTRY/summer-checkin-app:$VERSION
  docker push $REGISTRY/summer-checkin-app:latest
  docker push $REGISTRY/summer-checkin-embedding:$VERSION
  docker push $REGISTRY/summer-checkin-embedding:latest
  echo "  ✅ 推送完成"

  echo ""
  echo "[4/4] 服务器端操作:"
  echo ""
  echo "  ssh $ECS_USER@$ECS_HOST"
  echo "  cd ~/summer-checkin"
  echo "  docker compose pull"
  echo "  docker compose up -d"
  echo "  docker compose logs -f"
fi

echo ""
echo "=== 完成 ==="
