# ============================================================
# Summer Checkin — Windows 本地部署脚本 (PowerShell)
# 用法:
#   本地构建并导出 tar:  .\scripts\deploy.ps1 -Version "v1.0.0"
#   上传到 ECS:          .\scripts\deploy.ps1 -Version "v1.0.0" -ServerIP "你的ECS公网IP"
#
# 前提: 已安装 Docker Desktop
# ============================================================

param(
    [string]$Version = "latest",
    [string]$ServerIP = "",
    [string]$ServerUser = "root"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Summer Checkin 部署 (版本: $Version) ===" -ForegroundColor Cyan

# 1. 构建镜像
Write-Host ""
Write-Host "[1/5] 构建 Docker 镜像..." -ForegroundColor Yellow
docker build -t summer-checkin-app:$Version -f Dockerfile .
docker build -t summer-checkin-embedding:$Version -f Dockerfile.embedding .
Write-Host "  ✅ 构建完成" -ForegroundColor Green

# 2. 导出 tar
Write-Host ""
Write-Host "[2/5] 导出镜像 tar..." -ForegroundColor Yellow
docker save -o summer-checkin-app-$Version.tar summer-checkin-app:$Version
docker save -o summer-checkin-embedding-$Version.tar summer-checkin-embedding:$Version
Write-Host "  ✅ 导出完成" -ForegroundColor Green

# 3. 上传到服务器
if ($ServerIP) {
    Write-Host ""
    Write-Host "[3/5] 上传到 ECS ($ServerIP)..." -ForegroundColor Yellow

    # 确保服务器目录存在
    ssh "${ServerUser}@${ServerIP}" "mkdir -p ~/summer-checkin/nginx"

    # SCP 上传
    scp "summer-checkin-app-$Version.tar" "${ServerUser}@${ServerIP}:~/summer-checkin/"
    scp "summer-checkin-embedding-$Version.tar" "${ServerUser}@${ServerIP}:~/summer-checkin/"
    scp "docker-compose.yml" "${ServerUser}@${ServerIP}:~/summer-checkin/"
    scp "nginx\nginx.conf" "${ServerUser}@${ServerIP}:~/summer-checkin/nginx/"
    Write-Host "  ✅ 上传完成" -ForegroundColor Green

    # 4. 服务器端加载镜像
    Write-Host ""
    Write-Host "[4/5] 服务器加载镜像..." -ForegroundColor Yellow
    ssh "${ServerUser}@${ServerIP}" @"
cd ~/summer-checkin
docker load -i summer-checkin-app-$Version.tar
docker load -i summer-checkin-embedding-$Version.tar
"@
    Write-Host "  ✅ 加载完成" -ForegroundColor Green

    # 5. 启动
    Write-Host ""
    Write-Host "[5/5] 启动服务..." -ForegroundColor Yellow
    ssh "${ServerUser}@${ServerIP}" @"
cd ~/summer-checkin
docker compose up -d
echo ""
echo '查看日志: docker compose logs -f'
"@
    Write-Host "  ✅ 启动完成" -ForegroundColor Green

} else {
    Write-Host ""
    Write-Host "[3/5] 上传 — 请手动执行:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  scp summer-checkin-app-$Version.tar $ServerUser@<你的ECS_IP>:~/summer-checkin/"
    Write-Host "  scp summer-checkin-embedding-$Version.tar $ServerUser@<你的ECS_IP>:~/summer-checkin/"
    Write-Host "  scp docker-compose.yml $ServerUser@<你的ECS_IP>:~/summer-checkin/"
    Write-Host "  scp nginx\nginx.conf $ServerUser@<你的ECS_IP>:~/summer-checkin/nginx/"
    Write-Host ""
    Write-Host "[4/5] 服务器端加载镜像:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ssh $ServerUser@<你的ECS_IP>"
    Write-Host "  cd ~/summer-checkin"
    Write-Host "  docker load -i summer-checkin-app-$Version.tar"
    Write-Host "  docker load -i summer-checkin-embedding-$Version.tar"
    Write-Host ""
    Write-Host "[5/5] 启动服务:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  docker compose up -d"
    Write-Host "  docker compose logs -f"
}

# 清理本地 tar（可选）
Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host "是否删除本地 tar 文件? (y/n): " -NoNewline -ForegroundColor DarkGray
$response = Read-Host
if ($response -eq "y") {
    Remove-Item "summer-checkin-app-$Version.tar" -ErrorAction SilentlyContinue
    Remove-Item "summer-checkin-embedding-$Version.tar" -ErrorAction SilentlyContinue
    Write-Host "  已删除" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "访问: http://${ServerIP}" -ForegroundColor Cyan
