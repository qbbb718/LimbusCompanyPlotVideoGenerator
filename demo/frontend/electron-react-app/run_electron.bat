
@echo off
echo ========================================
echo 启动 Electron 应用
echo ========================================
echo.

cd /d %~dp0

echo 正在启动开发服务器...
start "React Dev Server" cmd /k "npm start"

echo 等待开发服务器启动...
timeout /t 10 /nobreak > nul

echo 正在启动 Electron 应用...
call npm run electron-dev

pause
