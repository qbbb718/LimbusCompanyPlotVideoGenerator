
# Electron 应用设置说明

## 概述
本项目已配置为可以作为 Electron 桌面应用运行。

## 设置步骤

1. 安装依赖
```bash
npm install
```

2. 开发模式运行
```bash
npm run electron-dev
```

3. 构建应用
```bash
npm run electron-pack
```

## 文件说明

### 新增文件
- `public/electron.js` - Electron 主进程文件
- `public/preload.js` - 预加载脚本，用于安全通信
- `src/App_electron.tsx` - Electron 版本的 App 组件
- `src/App_electron.css` - Electron 版本的样式

### 修改的文件
- `package.json` - 添加了 Electron 相关的脚本和依赖
- `src/index.tsx` - 根据环境加载不同的 App 组件

## 功能特性

1. **窗口控制**
   - 自定义窗口标题栏
   - 最小化、最大化、关闭按钮
   - 窗口可拖动

2. **菜单系统**
   - 文件菜单：新建、打开、保存项目，导出视频
   - 编辑菜单：撤销、重做、剪切、复制、粘贴、全选
   - 视图菜单：重新加载、开发者工具、缩放、全屏
   - 帮助菜单：关于信息

3. **文件操作**
   - 打开项目文件对话框
   - 保存项目文件对话框
   - 项目文件为 JSON 格式

4. **通知系统**
   - 操作成功/失败通知

## 注意事项

1. 确保 `public/favicon.ico` 文件存在，这是应用图标
2. 开发环境下会自动打开开发者工具
3. 生产环境下构建的应用会包含所有必要的资源

## 故障排除

如果遇到问题，请检查：
1. 所有依赖是否正确安装
2. electron.js 和 preload.js 文件是否存在
3. App_electron.tsx 和 App_electron.css 是否存在
