# Railway CLI 배포 스크립트
# 사용 전 터미널에서 한 번 실행: railway login

$ErrorActionPreference = "Stop"
$root = "d:\OneDrive\Cursor_AI_Project"

Write-Host "=== Railway deploy (Lotto645 + financial-info) ===" -ForegroundColor Cyan
Write-Host ""

# 로그인 확인
$whoami = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway not logged in. Run this in your terminal first:" -ForegroundColor Yellow
    Write-Host "  railway login" -ForegroundColor White
    Write-Host ""
    exit 1
}
Write-Host "Logged in: $whoami" -ForegroundColor Green
Write-Host ""

# Lotto645
Write-Host "--- Lotto645 ---" -ForegroundColor Cyan
Set-Location "$root\Lotto_v200"
if (-not (Test-Path ".railway")) {
    Write-Host "Not linked. Run: railway link" -ForegroundColor Yellow
    railway link
}
railway up
if ($LASTEXITCODE -ne 0) { Write-Host "Lotto645 deploy failed." -ForegroundColor Red; exit 1 }
Write-Host "Lotto645 deploy done." -ForegroundColor Green
Write-Host ""

# financial-info
Write-Host "--- financial-info ---" -ForegroundColor Cyan
Set-Location "$root\financial-info"
if (-not (Test-Path ".railway")) {
    Write-Host "Not linked. Run: railway link" -ForegroundColor Yellow
    railway link
}
railway up
if ($LASTEXITCODE -ne 0) { Write-Host "financial-info deploy failed." -ForegroundColor Red; exit 1 }
Write-Host "financial-info deploy done." -ForegroundColor Green
Write-Host ""
Write-Host "Done. Create domains in Railway dashboard: Settings -> Networking -> Generate Domain" -ForegroundColor Cyan
