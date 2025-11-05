@echo off
echo 启动后端服务器...
start cmd /k "cd /d e:/LimbusCompanyPlotVideoGenerator/demo && mvn spring-boot:run"

echo 等待后端启动...
timeout /t 10 /nobreak > nul

echo 启动前端应用...
start cmd /k "cd /d e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app && npm run electron-dev"

echo 前后端启动命令已执行
pause
