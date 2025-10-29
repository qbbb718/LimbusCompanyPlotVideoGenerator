
# Electron 集成说明

## 概述
本指南说明如何将 Electron 功能集成到现有的前端项目中，避免重复安装依赖。

## 使用方法

1. 在前端项目根目录运行 `add_electron.bat` 脚本
2. 安装新添加的依赖：`npm install`
3. 运行 Electron 应用：`npm run electron-dev`

## 脚本功能

`add_electron.bat` 脚本会执行以下操作：

1. 创建 `public/electron` 目录并复制 Electron 主进程文件
2. 创建 `src/electron` 目录并复制 Electron 特定组件
3. 更新 `package.json` 添加 Electron 相关配置和脚本
4. 修改 `index.tsx` 以支持环境检测

## 文件结构

添加 Electron 后，项目结构如下：

```
frontend/
├── public/
│   └── electron/
│       ├── electron.js       # Electron 主进程
│       └── preload.js        # 预加载脚本
├── src/
│   └── electron/
│       ├── App_electron.tsx  # Electron 版本的 App 组件
│       └── App_electron.css  # Electron 特定样式
├── package.json              # 已更新，包含 Electron 配置
└── index.tsx                 # 已更新，支持环境检测
```

## 运行命令

- 开发模式：`npm run electron-dev`
- 构建应用：`npm run electron-pack` (需要添加 electron-builder)

## 注意事项

1. 确保 `public/favicon.ico` 文件存在
2. 开发模式下会自动打开开发者工具
3. 首次运行可能需要一些时间
