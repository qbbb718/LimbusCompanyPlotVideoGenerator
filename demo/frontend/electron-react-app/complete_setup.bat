
@echo off
echo ========================================
echo LimbusCompany Plot Video Generator
echo Electron 应用设置脚本
echo ========================================
echo.

echo 步骤 1: 替换 electron.js 文件...
cd /d %~dp0\public
python replace_electron.py
echo 完成！
echo.

echo 步骤 2: 安装依赖...
cd /d %~dp0
call npm install --no-audit --no-fund
echo 依赖安装完成！
echo.

echo ========================================
echo 设置完成！
echo ========================================
echo.
echo 现在您可以运行以下命令：
echo   - 开发模式: npm run electron-dev
echo   - 构建应用: npm run electron-pack
echo.
echo 注意事项：
echo 1. 确保 public/favicon.ico 文件存在
echo 2. 开发模式下会自动打开开发者工具
echo 3. 首次运行可能需要一些时间
echo.
pause
