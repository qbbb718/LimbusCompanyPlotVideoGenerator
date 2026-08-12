# build-package.ps1
$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  LimbusCompany Plot Video Generator - Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$DEMO_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$FRONTEND_DIR = Join-Path $DEMO_DIR "frontend\electron-react-app"

# 检查环境
Write-Host "[1/4] Checking environment..."
try {
    $null = Get-Command mvn -ErrorAction Stop
    $null = Get-Command npm -ErrorAction Stop
    Write-Host "      Environment check passed." -ForegroundColor Green
} catch {
    Write-Host "      [ERROR] Missing required tool: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# JRE
Write-Host "[2/4] Generating bundled JRE..."
$JRE_PATH = Join-Path $DEMO_DIR "jre\bin\java.exe"
if (-not (Test-Path $JRE_PATH)) {
    & "$env:JAVA_HOME\bin\jlink" --add-modules java.base,java.desktop,java.instrument,java.logging,java.management,java.naming,java.sql,java.xml,jdk.unsupported,jdk.management,jdk.crypto.ec,jdk.zipfs,java.net.http,java.security.jgss,java.security.sasl --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output (Join-Path $DEMO_DIR "jre")
}
Write-Host "      JRE ready." -ForegroundColor Green
Write-Host ""

# Backend
Write-Host "[3/4] Building Spring Boot backend..."
Push-Location $DEMO_DIR
& mvn clean package -DskipTests -q
if ($LASTEXITCODE -ne 0) { Write-Host "      [ERROR] Backend build failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "      Backend build complete." -ForegroundColor Green
Write-Host ""

# Frontend
Write-Host "[4/4] Building React frontend..."
Push-Location $FRONTEND_DIR
$env:CI = "false"
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "      [ERROR] Frontend build failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "      Frontend build complete." -ForegroundColor Green
Write-Host ""

# Electron
Write-Host "[5/5] Packaging Electron app..."
Push-Location $FRONTEND_DIR
& npx electron-builder --win --x64 --publish never
if ($LASTEXITCODE -ne 0) { Write-Host "      [ERROR] Packaging failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host ""

Write-Host "============================================" -ForegroundColor Green
Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "  Installer: $FRONTEND_DIR\release\" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green