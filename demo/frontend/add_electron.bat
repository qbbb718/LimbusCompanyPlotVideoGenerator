
@echo off
echo ========================================
echo 添加 Electron 功能到现有前端项目
echo ========================================
echo.

cd /d %~dp0

echo 步骤 1: 复制必要的 Electron 文件...
mkdir public\electron 2>nul
copy /Y ..\demorontend\electron-react-app\public\electron.js public\electroncopy /Y ..\demorontend\electron-react-app\public\preload.js public\electronecho 完成！
echo.

echo 步骤 2: 添加 Electron 组件...
mkdir src\electron 2>nul
copy /Y ..\demorontend\electron-react-app\src\App_electron.tsx src\electroncopy /Y ..\demorontend\electron-react-app\src\App_electron.css src\electronecho 完成！
echo.

echo 步骤 3: 更新 package.json...
node -e "
const fs = require('fs');
const path = require('path');

// 读取 package.json
const packagePath = path.join(__dirname, 'package.json');
const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// 添加 Electron 相关配置
packageData.main = 'public/electron/electron.js';

// 添加 Electron 脚本
if (!packageData.scripts) packageData.scripts = {};
packageData.scripts.electron = 'electron .';
packageData.scripts['electron-dev'] = 'concurrently \"npm start\" \"wait-on http://localhost:3000 && electron .\"';

// 添加 Electron 依赖
if (!packageData.devDependencies) packageData.devDependencies = {};
packageData.devDependencies['concurrently'] = '^7.6.0';
packageData.devDependencies['electron'] = '^39.0.0';
packageData.devDependencies['wait-on'] = '^7.0.1';

// 写回文件
fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
console.log('package.json 已更新');
"
echo 完成！
echo.

echo 步骤 4: 更新 index.tsx...
node -e "
const fs = require('fs');
const path = require('path');

// 读取 index.tsx
const indexPath = path.join(__dirname, 'src', 'index.tsx');
let indexContent = fs.readFileSync(indexPath, 'utf8');

// 检查是否已经添加了 Electron 相关代码
if (!indexContent.includes('isElectron')) {
  // 找到 import App 的行
  const importMatch = indexContent.match(/import App from ['"].*['"];/);

  if (importMatch) {
    const oldImport = importMatch[0];
    const newImport = `// 检测是否在 Electron 环境中运行
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

// 根据环境导入不同的 App 组件
const App = isElectron ? require('./electron/App_electron').default : require('./App').default;`;

    indexContent = indexContent.replace(oldImport, newImport);

    // 写回文件
    fs.writeFileSync(indexPath, indexContent);
    console.log('index.tsx 已更新');
  } else {
    console.log('无法找到 import App 语句，请手动更新 index.tsx');
  }
} else {
  console.log('index.tsx 已经包含 Electron 相关代码');
}
"
echo 完成！
echo.

echo ========================================
 Electron 功能已添加到现有前端项目
========================================
echo.
echo 现在您可以运行以下命令：
echo   - 安装新依赖: npm install
echo   - 开发模式: npm run electron-dev
echo.
pause
