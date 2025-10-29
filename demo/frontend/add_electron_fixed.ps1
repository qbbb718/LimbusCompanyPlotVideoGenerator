
# PowerShell 脚本：添加 Electron 功能到现有前端项目
Write-Host "========================================" -ForegroundColor Green
Write-Host "添加 Electron 功能到现有前端项目" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# 步骤 1: 复制必要的 Electron 文件
Write-Host "步骤 1: 复制必要的 Electron 文件..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "public\electron" | Out-Null
Copy-Item -Force "..\demo\frontend\electron-react-app\public\electron.js" "public\electron\"
Copy-Item -Force "..\demo\frontend\electron-react-app\public\preload.js" "public\electron\"
Write-Host "完成！" -ForegroundColor Green
Write-Host ""

# 步骤 2: 添加 Electron 组件
Write-Host "步骤 2: 添加 Electron 组件..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "src\electron" | Out-Null
Copy-Item -Force "..\demo\frontend\electron-react-app\src\App_electron.tsx" "src\electron\"
Copy-Item -Force "..\demo\frontend\electron-react-app\src\App_electron.css" "src\electron\"
Write-Host "完成！" -ForegroundColor Green
Write-Host ""

# 步骤 3: 更新 package.json
Write-Host "步骤 3: 更新 package.json..." -ForegroundColor Yellow
$packagePath = "package.json"
$packageData = Get-Content $packagePath | ConvertFrom-Json

# 添加 Electron 相关配置
$packageData | Add-Member -NotePropertyName "main" -NotePropertyValue "public/electron/electron.js" -Force

# 添加 Electron 脚本
if (-not $packageData.scripts) { $packageData | Add-Member -NotePropertyName "scripts" -NotePropertyValue @{} }
$packageData.scripts | Add-Member -NotePropertyName "electron" -NotePropertyValue "electron ." -Force
$packageData.scripts | Add-Member -NotePropertyName "electron-dev" -NotePropertyValue "concurrently "npm start" "wait-on http://localhost:3000 && electron ."" -Force

# 添加 Electron 依赖
if (-not $packageData.devDependencies) { $packageData | Add-Member -NotePropertyName "devDependencies" -NotePropertyValue @{} }
$packageData.devDependencies | Add-Member -NotePropertyName "concurrently" -NotePropertyValue "^7.6.0" -Force
$packageData.devDependencies | Add-Member -NotePropertyName "electron" -NotePropertyValue "^39.0.0" -Force
$packageData.devDependencies | Add-Member -NotePropertyName "wait-on" -NotePropertyValue "^7.0.1" -Force

# 写回文件
$packageData | ConvertTo-Json -Depth 10 | Set-Content $packagePath
Write-Host "完成！" -ForegroundColor Green
Write-Host ""

# 步骤 4: 更新 index.tsx
Write-Host "步骤 4: 更新 index.tsx..." -ForegroundColor Yellow
$indexPath = "src\index.tsx"
$indexContent = Get-Content $indexPath -Raw

# 检查是否已经添加了 Electron 相关代码
if ($indexContent -notlike "*isElectron*") {
    # 找到 import App 的行
    $importMatch = [regex]::Match($indexContent, "import App from [\'\"].*[\'\"].*;")

    if ($importMatch.Success) {
        $oldImport = $importMatch.Value

        $newImport = @"
// 检测是否在 Electron 环境中运行
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

// 根据环境导入不同的 App 组件
const App = isElectron ? require('./electron/App_electron').default : require('./App').default;
"@

        $indexContent = $indexContent.Replace($oldImport, $newImport)

        # 写回文件
        Set-Content -Path $indexPath -Value $indexContent
        Write-Host "完成！" -ForegroundColor Green
    } else {
        Write-Host "无法找到 import App 语句，请手动更新 index.tsx" -ForegroundColor Red
    }
} else {
    Write-Host "index.tsx 已经包含 Electron 相关代码" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Electron 功能已添加到现有前端项目" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "现在您可以运行以下命令：" -ForegroundColor Cyan
Write-Host "  - 安装新依赖: npm install" -ForegroundColor White
Write-Host "  - 开发模式: npm run electron-dev" -ForegroundColor White
Write-Host ""
Read-Host "按 Enter 键退出"
