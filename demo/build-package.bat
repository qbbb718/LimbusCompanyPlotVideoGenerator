@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ============================================
echo   边狱巴士剧情视频生成器 — 一键打包脚本
echo ============================================
echo.

set "DEMO_DIR=%~dp0"
set "FRONTEND_DIR=%DEMO_DIR%frontend\electron-react-app"

REM ── 1. 编译后端 ──────────────────────────────────
echo [1/3] 编译 Spring Boot 后端...
cd /d "%DEMO_DIR%"
call mvn clean package -DskipTests -q
if errorlevel 1 (
    echo [错误] 后端编译失败
    pause
    exit /b 1
)
echo       后端编译完成
echo.

REM ── 2. 编译前端 ──────────────────────────────────
echo [2/3] 编译 React 前端...
cd /d "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [错误] 前端编译失败
    pause
    exit /b 1
)
echo       前端编译完成
echo.

REM ── 3. 打包 Electron 应用 ────────────────────────
echo [3/3] 打包 Electron 应用...
echo.
echo       正在使用 electron-builder 打包，
echo       首次运行可能需要下载 Electron 二进制文件，
echo       请耐心等待...
echo.
npx electron-builder --win --x64
if errorlevel 1 (
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   打包完成！
echo   安装包位置: %FRONTEND_DIR%\release\
echo ============================================
dir /b "%FRONTEND_DIR%\release\*.exe" 2>nul
echo.
pause
