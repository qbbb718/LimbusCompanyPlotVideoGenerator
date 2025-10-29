
@echo off
echo ========================================
echo 添加 Electron 功能到现有前端项目
echo ========================================
echo.

echo 步骤 1: 复制必要的 Electron 文件...
mkdir public\electron 2>nul
copy /Y ..\demorontend\electron-react-app\public\electron.js public\electroncopy /Y ..\demorontend\electron-react-app\public\preload.js public\electronecho 完成！
echo.

echo 步骤 2: 添加 Electron 组件...
mkdir src\electron 2>nul
copy /Y ..\demorontend\electron-react-app\src\App_electron.tsx src\electroncopy /Y ..\demorontend\electron-react-app\src\App_electron.css src\electronecho 完成！
echo.

echo 步骤 3: 更新 package.json...
echo 正在创建 package.json 的更新脚本...
(
echo const fs = require('fs');
echo const path = require('path');
echo.
echo // 读取 package.json
echo const packagePath = path.join(__dirname, 'package.json');
echo const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
echo.
echo // 添加 Electron 相关配置
echo packageData.main = 'public/electron/electron.js';
echo.
echo // 添加 Electron 脚本
echo if (!packageData.scripts) packageData.scripts = {};
echo packageData.scripts.electron = 'electron .';
echo packageData.scripts['electron-dev'] = 'concurrently \"npm start\" \"wait-on http://localhost:3000 && electron .\"';
echo.
echo // 添加 Electron 依赖
echo if (!packageData.devDependencies) packageData.devDependencies = {};
echo packageData.devDependencies['concurrently'] = '^7.6.0';
echo packageData.devDependencies['electron'] = '^39.0.0';
echo packageData.devDependencies['wait-on'] = '^7.0.1';
echo.
echo // 写回文件
echo fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
echo console.log('package.json 已更新');
) > update_package.js

node update_package.js
del update_package.js
echo 完成！
echo.

echo 步骤 4: 更新 index.tsx...
(
echo const fs = require('fs');
echo const path = require('path');
echo.
echo // 读取 index.tsx
echo const indexPath = path.join(__dirname, 'src', 'index.tsx');
echo let indexContent = fs.readFileSync(indexPath, 'utf8');
echo.
echo // 检查是否已经添加了 Electron 相关代码
echo if (!indexContent.includes('isElectron')) {
echo   // 找到 import App 的行
echo   const importMatch = indexContent.match(/import App from ['"].*['"];?/);
echo   if (importMatch) {
echo     const oldImport = importMatch[0];
echo     const newImport = '// 检测是否在 Electron 环境中运行
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

// 根据环境导入不同的 App 组件
const App = isElectron ? require('./electron/App_electron').default : require('./App').default;';
echo     indexContent = indexContent.replace(oldImport, newImport);
echo     fs.writeFileSync(indexPath, indexContent);
echo     console.log('index.tsx 已更新');
echo   } else {
echo     console.log('无法找到 import App 语句，请手动更新 index.tsx');
echo   }
echo } else {
echo   console.log('index.tsx 已经包含 Electron 相关代码');
echo }
) > update_index.js

node update_index.js
del update_index.js
echo 完成！
echo.

echo ========================================
echo Electron 功能已添加到现有前端项目
echo ========================================
echo.
echo 现在您可以运行以下命令：
echo   - 安装新依赖: npm install
echo   - 开发模式: npm run electron-dev
echo.
pause
