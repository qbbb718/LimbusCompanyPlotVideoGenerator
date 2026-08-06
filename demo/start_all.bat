@echo off
REM -----------------------------------------
REM 一键启动后端(Spring Boot)和前端(Electron React)
REM 使用说明: 双击运行或在命令行执行本脚本
REM -----------------------------------------

REM 设置控制台为 UTF-8 以支持中文输出
chcp 65001 >nul

REM 项目根路径（可根据需要调整）
set PROJECT_ROOT=e:\LimbusCompanyPlotVideoGenerator\demo
set BACKEND_DIR=%PROJECT_ROOT%
set FRONTEND_DIR=%PROJECT_ROOT%\frontend\electron-react-app
set BACKEND_HEALTH_URL=http://localhost:8081/api/health
set MAX_WAIT=120

echo ========================================
echo   LimbusCompany Plot Video Generator
echo   一键启动脚本
echo ========================================
echo.

REM -----------------------------------------
REM 1. 检查前端目录
REM -----------------------------------------
if not exist "%FRONTEND_DIR%" (
    echo [错误] 未找到前端目录 %FRONTEND_DIR%
    pause
    exit /b 1
)

REM -----------------------------------------
REM 2. 启动后端服务器
REM -----------------------------------------
echo [1/3] 启动后端服务器 (Spring Boot)...
start "backend" cmd /k "cd /d %BACKEND_DIR% && set JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8 -Duser.timezone=Asia/Shanghai && mvn spring-boot:run -Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8"

REM -----------------------------------------
REM 3. 轮询等待后端健康检查通过
REM -----------------------------------------
echo [2/3] 等待后端启动完成 (健康检查 %BACKEND_HEALTH_URL%)...
set WAIT_COUNT=0

:wait_backend
powershell -Command "try { $r = Invoke-WebRequest -Uri '%BACKEND_HEALTH_URL%' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo       ✓ 后端已启动，健康检查通过
    goto backend_ready
)
set /a WAIT_COUNT+=3
if %WAIT_COUNT% geq %MAX_WAIT% (
    echo       ✗ 后端启动超时 ^(%MAX_WAIT%秒^)，请检查后端窗口日志
    echo       前端仍会启动，但将使用模拟数据
    goto start_frontend
)
echo       等待中... ^(%WAIT_COUNT%/%MAX_WAIT%秒^)
REM 用 ping 替代 timeout：timeout 在 stdin 被重定向时（如从 IDE/重定向环境运行）会立即返回不等待，
REM 导致 WAIT_COUNT 飞速累加、后端还没起来就误判超时。ping 不依赖 stdin，能稳定等待约 3 秒。
ping -n 4 127.0.0.1 >nul
goto wait_backend

:backend_ready

REM -----------------------------------------
REM 4. 启动前端应用
REM -----------------------------------------
:start_frontend
echo [3/3] 启动前端应用 (Electron 开发模式)...

cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
    echo       前端依赖缺失，正在安装...
    call npm install
)

REM 清理 3000 端口可能残留的占用：上一次未正常关闭时，旧的开发服务器仍占用 3000，
REM 会导致本次 npm start 报 "Something is already running on port 3000" 并退出，Electron 不启动。
REM /T 连同子进程一起结束（react 开发服务器是多级 node 进程）；不吞错误信息，便于排查。
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo       [清理] 占用 3000 端口的残留进程 PID=%%P
    taskkill /F /T /PID %%P >nul
)
REM 等待操作系统完全释放端口，避免下一次 npm start 因端口尚未释放而误判占用
ping -n 3 127.0.0.1 >nul

REM 设置 BROWSER=none 防止 React 开发服务器自动打开系统浏览器。
REM 注意：用引号包裹赋值 set "BROWSER=none" 并放在父脚本环境，子 cmd 会继承该变量。
REM 避免写成 "set BROWSER=none && ..." ——那样值会带尾随空格变成 "none "，
REM 导致 CRA 的 openBrowser 中 === 'none' 严格判断失效，反而尝试用名为 "none " 的程序打开浏览器。
REM Electron 窗口通过 wait-on 等待开发服务器就绪后自动加载。
set "BROWSER=none"
start "frontend" cmd /k "cd /d %FRONTEND_DIR% && npm run electron-dev"

echo.
echo ========================================
echo   所有启动命令已发出
echo   - 后端: http://localhost:8081
echo   - 前端: Electron 窗口 (不打开浏览器)
echo ========================================
echo.
echo 提示: 关闭此窗口不会停止应用
echo 要停止应用，请关闭 backend 和 frontend 窗口
echo.
pause
