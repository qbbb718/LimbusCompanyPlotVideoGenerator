
@echo off
echo 正在安装 Electron 应用所需依赖...
cd /d %~dp0
call npm install --no-audit --no-fund
echo.
echo 依赖安装完成！
echo.
echo 现在您可以运行以下命令：
echo   - 开发模式: npm run electron-dev
echo   - 构建应用: npm run electron-pack
echo.
pause
