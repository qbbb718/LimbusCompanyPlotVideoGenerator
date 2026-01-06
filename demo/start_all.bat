@echo off
echo 设置环境以正确显示中文...
echo 启动后端服务器...
start cmd /k "chcp 65001 >nul && set JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8 -Duser.timezone=Asia/Shanghai && cd /d e:/LimbusCompanyPlotVideoGenerator/demo && mvn spring-boot:run -Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8"

echo 等待后端启动...
timeout /t 10 /nobreak > nul

echo 检查并安装前端依赖...
cd /d e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app
if not exist "node_modules" (
    echo 正在安装前端依赖...
    npm install
)

echo 启动前端应用...
start cmd /k "cd /d e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app && npm run electron-dev"

echo 前后端启动命令已执行
pause
