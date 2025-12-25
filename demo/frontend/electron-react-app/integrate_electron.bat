
@echo off
echo ========================================
echo 整合 Electron 到现有前端项目
echo ========================================
echo.

cd /d %~dp0

echo 步骤 1: 复制必要的 Electron 文件到前端目录...
copy /Y public\electron.js ..\publiccopy /Y public\preload.js ..\publicecho 完成！
echo.

echo 步骤 2: 修改前端项目的 package.json...
echo 正在创建 package.json 的更新脚本...
(
echo const fs = require('fs');
echo const path = require('path');
echo.
echo // 读取前端项目的 package.json
echo const packagePath = path.join(__dirname, '..', 'package.json');
echo const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
echo.
echo // 添加 Electron 相关配置
echo packageData.main = 'public/electron.js';
echo.
echo // 添加 Electron 脚本
echo if (!packageData.scripts) packageData.scripts = {};
echo packageData.scripts.electron = 'electron .';
echo packageData.scripts['electron-dev'] = 'concurrently \"npm start\" \"wait-on http://localhost:3000 && electron .\"';
echo packageData.scripts['electron-pack'] = 'npm run build && electron-builder';
echo packageData.scripts['preelectron-pack'] = 'npm run build';
echo.
echo // 添加 Electron 依赖
echo if (!packageData.devDependencies) packageData.devDependencies = {};
echo packageData.devDependencies['concurrently'] = '^7.6.0';
echo packageData.devDependencies['electron'] = '^39.0.0';
echo packageData.devDependencies['electron-builder'] = '^23.6.0';
echo packageData.devDependencies['wait-on'] = '^7.0.1';
echo.
echo // 写回文件
echo fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
echo console.log('前端项目 package.json 已更新');
) > update_package.js

node update_package.js
del update_package.js
echo 完成！
echo.

echo 步骤 3: 复制 Electron 特定的组件文件...
if not exist ..\src mkdir ..\src
copy /Y src\App_electron.tsx ..\srccopy /Y src\App_electron.css ..\srcecho 完成！
echo.

echo 步骤 4: 修改前端项目的 index.tsx...
(
echo const fs = require('fs');
echo const path = require('path');
echo.
echo // 读取前端项目的 index.tsx
echo const indexPath = path.join(__dirname, '..', 'src', 'index.tsx');
echo let indexContent = fs.readFileSync(indexPath, 'utf8');
echo.
echo // 替换导入部分
echo const oldImport = 'import App from './App';';
echo const newImport = '// 检测是否在 Electron 环境中运行
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

// 根据环境导入不同的 App 组件
const App = isElectron ? require('./App_electron').default : require('./App').default;';
echo.
echo indexContent = indexContent.replace(oldImport, newImport);
echo.
echo // 写回文件
echo fs.writeFileSync(indexPath, indexContent);
echo console.log('前端项目 index.tsx 已更新');
) > update_index.js

node update_index.js
del update_index.js
echo 完成！
echo.

echo ========================================
echo 整合完成！
echo ========================================
echo.
echo 现在您可以在前端目录中运行以下命令：
echo   - 安装依赖: npm install
echo   - 开发模式: npm run electron-dev
echo   - 构建应用: npm run electron-pack
echo.
echo 注意事项：
echo 1. 确保前端目录中有 public/favicon.ico 文件
echo 2. 开发模式下会自动打开开发者工具
echo 3. 首次运行可能需要一些时间
echo.
pause
