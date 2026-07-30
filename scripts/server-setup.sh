#!/bin/bash
set -e

# ============================================================
# Summer Checkin — 华为云 ECS 首次服务器初始化
# 支持: OpenEuler / CentOS / RHEL / Ubuntu / Debian
#
# 用法:
#   1. 上传: scp scripts/server-setup.sh root@<你的ECS_IP>:~/
#   2. 登录: ssh root@<你的ECS_IP>
#   3. 执行: bash server-setup.sh
# ============================================================

echo "============================================"
echo "  Summer Checkin — ECS 初始化"
echo "============================================"

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME="$ID"
    OS_VERSION="$VERSION_ID"
else
    OS_NAME="unknown"
fi

echo "  检测到操作系统: $OS_NAME $OS_VERSION"

# 1. 安装 Docker
echo ""
echo "[1/5] 安装 Docker..."

if command -v docker &> /dev/null; then
    echo "  ✅ Docker 已安装: $(docker --version)"
else
    echo "  正在安装 Docker..."

    if [ "$OS_NAME" = "openEuler" ] || [ "$OS_NAME" = "centos" ] || [ "$OS_NAME" = "rhel" ] || [ "$OS_NAME" = "fedora" ]; then
        # ----------------------------------------------------------
        # OpenEuler / CentOS / RHEL — 使用 dnf/yum
        # ----------------------------------------------------------
        echo "  检测到 RHEL 系发行版，使用 dnf 安装..."

        # 卸载旧版本（如有）
        sudo dnf remove -y docker docker-client docker-client-latest docker-common \
            docker-latest docker-latest-logrotate docker-logrotate docker-engine \
            2>/dev/null || true

        # 安装 dnf-plugins-core
        sudo dnf install -y dnf-plugins-core

        # 添加 Docker CE 仓库（使用 CentOS 8/9 仓库，兼容 OpenEuler）
        if command -v dnf-config-manager &> /dev/null; then
            OS_MAJOR="${OS_VERSION%%.*}"
            # OpenEuler 使用 CentOS 8 的 Docker 仓库
            sudo dnf config-manager --add-repo \
                "https://download.docker.com/linux/centos/docker-ce.repo" 2>/dev/null || true

            # 如果添加失败（OpenEuler 22.03+），直接下载 rpm 安装
            if [ ! -f /etc/yum.repos.d/docker-ce.repo ]; then
                echo "  dnf-config-manager 失败，改用 containerd + 手动安装..."
                # 备用方案：安装 containerd 而非完整 Docker
                sudo dnf install -y containerd.io docker-ce docker-ce-cli 2>/dev/null || {
                    echo "  仓库方式安装失败，尝试直接安装 docker 包..."
                    sudo dnf install -y docker 2>/dev/null || {
                        echo "  ❌ Docker 安装失败，请手动安装:"
                        echo "  sudo dnf install -y docker"
                        echo "  sudo systemctl start docker"
                        exit 1
                    }
                }
            else
                sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            fi
        else
            sudo dnf install -y docker 2>/dev/null || {
                echo "  ❌ 安装失败，请参考华为云文档安装 Docker"
                exit 1
            }
        fi
    else
        # ----------------------------------------------------------
        # Ubuntu / Debian — 使用官方便捷脚本
        # ----------------------------------------------------------
        echo "  检测到 Debian 系发行版，使用官方脚本安装..."
        curl -fsSL https://get.docker.com | bash
    fi

    echo "  ✅ Docker 安装完成: $(docker --version 2>/dev/null || echo '需要重启生效')"
fi

# 2. 启动 Docker 并设置开机自启
echo ""
echo "[2/5] 配置 Docker 服务..."
sudo systemctl start docker 2>/dev/null || true
sudo systemctl enable docker 2>/dev/null || true
echo "  ✅ Docker 已启动并设置开机自启"

# 3. 将当前用户加入 docker 组
echo ""
echo "[3/5] 配置 Docker 用户权限..."
if groups $USER 2>/dev/null | grep -q docker; then
    echo "  ✅ 用户已在 docker 组中"
else
    sudo usermod -aG docker $USER
    echo "  ✅ 已添加（需要退出重新登录才能生效）"
fi

# 4. 创建项目目录
echo ""
echo "[4/5] 创建项目目录..."
mkdir -p ~/summer-checkin/nginx
echo "  ✅ ~/summer-checkin/"
echo "  ✅ ~/summer-checkin/nginx/"

# 5. 防火墙配置
echo ""
echo "[5/5] 防火墙配置..."

# 本地防火墙（firewalld — OpenEuler/CentOS 默认）
if command -v firewall-cmd &> /dev/null; then
    echo "  检测到 firewalld..."
    sudo firewall-cmd --permanent --add-port=80/tcp 2>/dev/null && \
        echo "  ✅ 已开放 80 端口" || \
        echo "  ⚠️ 80 端口添加失败（可能已存在）"
    sudo firewall-cmd --reload 2>/dev/null
elif command -v ufw &> /dev/null; then
    echo "  检测到 ufw..."
    sudo ufw allow 80/tcp 2>/dev/null || true
    echo "  ✅ 已开放 80 端口"
elif command -v iptables &> /dev/null; then
    echo "  检测到 iptables（无 firewalld）..."
    echo "  ⚠️ 跳过本地防火墙，请手动确保 80 端口开放"
fi

echo ""
echo "============================================"
echo "  初始化完成!"
echo "============================================"
echo ""
echo "  ⚠️ 重要: 华为云控制台安全组开放端口:"
echo "     → 入方向 → TCP 80 → 0.0.0.0/0"
echo "     → 入方向 → TCP 22 → 你的IP/32"
echo ""
echo "  下一步:"
echo "  1. 退出重新登录 (让 docker 组生效)"
echo "  2. 上传部署文件到 ~/summer-checkin/:"
echo "     docker-compose.yml"
echo "     nginx/nginx.conf"
echo "     .env（从 .env.example 复制并填入真实值）"
echo "  3. 上传镜像 tar 或配置拉取镜像"
echo "  4. cd ~/summer-checkin && docker compose up -d"
echo ""
