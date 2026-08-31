# Summer Checkin 一键启动
$ErrorActionPreference = "SilentlyContinue"
$proj = $PSScriptRoot
if (-not $proj) { $proj = "C:\Users\LENOVO\Documents\Codex\2026-08-31\gdut4140-summer-checkin-https-github-com\summer-checkin" }
Set-Location $proj

# 读取 .env 的 DATABASE_URL，若没有则用 5433
$env:DATABASE_URL = if (Select-String -Path "$proj\.env" -Pattern "DATABASE_URL") { (Select-String -Path "$proj\.env" -Pattern "DATABASE_URL" | Select-Object -First 1).Line.Split("=",2)[1].Trim() } else { "postgresql://postgres:summer_checkin_dev@localhost:5433/summer_checkin" }
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = "postgresql://postgres:summer_checkin_dev@localhost:5433/summer_checkin" }

Write-Host "== postgres ==" -ForegroundColor Cyan
docker compose -f "$proj\docker-compose.yml" up -d postgres
# 等 healthy（最多30秒）
for ($i=0; $i -lt 15; $i++) {
  $h = docker inspect --format "{{.State.Health.Status}}" postgresServer 2>$null
  Write-Host "  health: $h"
  if ($h -match "healthy") { break }
  Start-Sleep 2
}

Write-Host "`n== 启动 Next (3000) + WS (3001) ==" -ForegroundColor Cyan
# 新开两个独立 PowerShell 窗口
Start-Process powershell -ArgumentList "-NoExit","-Command","`$env:DATABASE_URL='$env:DATABASE_URL'; Set-Location '$proj'; Write-Host 'Next dev http://localhost:3000' -ForegroundColor Green; npm run dev"
Start-Sleep 2
Start-Process powershell -ArgumentList "-NoExit","-Command","`$env:DATABASE_URL='$env:DATABASE_URL'; Set-Location '$proj'; Write-Host 'WS sidecar ws://localhost:3001' -ForegroundColor Green; npm run ws:dev"

Start-Sleep 3
Write-Host "`n正在打开浏览器 http://localhost:3000 ..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "`n完成！若 3000 长时间无响应，按 Ctrl+C 后改 PORT=3002 npm run dev 再试。" -ForegroundColor Yellow
