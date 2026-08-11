@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ============================================
echo   边狱巴士剧情视频生成器 — 一键打包脚本
echo ============================================
echo.

set "DEMO_DIR=%~dp0"
set "FRONTEND_DIR=%DEMO_DIR%frontend\electron-react-app"

REM ── 0. 生成内置 JRE（可选，如果已存在则跳过）──────────
if not exist "%DEMO_DIR%jre\bin\java.exe" (
    echo [0/4] 生成内置 JRE...
    if defined JAVA_HOME (
        if exist "%JAVA_HOME%\bin\jlink.exe" (
            "%JAVA_HOME%\bin\jlink" --add-modules java.base,java.desktop,java.instrument,java.logging,java.management,java.naming,java.sql,java.xml,jdk.unsupported,jdk.management,jdk.crypto.ec,jdk.zipfs,java.net.http,java.security.jgss,java.security.sasl --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output "%DEMO_DIR%jre"
            if errorlevel 1 (
                echo [错误] JRE 生成失败
                pause
                exit /b 1
            )
            echo       JRE 生成完成
        ) else (
            echo [警告] 找不到 jlink.exe，跳过 JRE 生成
        )
    ) else (
        echo [警告] JAVA_HOME 未设置，跳过 JRE 生成（需安装 JDK 21）
    )
    echo.
)

REM ── 1. 编译后端 ──────────────────────────────────
echo [1/4] 编译 Spring Boot 后端（仅 Windows x64 原生库）...
cd /d "%DEMO_DIR%"
call mvn clean package -DskipTests -q
if errorlevel 1 (
    echo [错误] 后端编译失败
    pause
    exit /b 1
)
echo       后端编译完成 ^(JAR 内含 JRE 运行时可解压^)
echo.

REM ── 2. 编译前端 ──────────────────────────────────
echo [2/4] 编译 React 前端...
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
echo [3/4] 打包 Electron 应用...
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
