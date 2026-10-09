# 边境公司剧情视频生成器 (LimbusCompanyPlotVideoGenerator)

[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.0-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Electron](https://img.shields.io/badge/Electron-39-blue.svg)](https://www.electronjs.org/)

一个用于自动生成《边狱公司》(Limbus Company) 剧情视频的工具，支持将剧情脚本转换为包含人物立绘、背景、音效和配音的完整视频。

## 快速安装（普通用户）

### 方式一：下载安装包（推荐）

从 [GitHub Releases](../../releases) 下载最新版 `LimbusCompany Plot Video Generator Setup x.x.x.exe`，双击安装。

- 安装包已包含所有依赖，**无需额外安装 Java、Maven 或 Node.js**
- 安装完成后桌面自动创建快捷方式，双击即可使用
- 支持自定义安装路径

### 方式二：从源码运行（开发者）

见下方 [开发环境搭建](#开发环境搭建)。

### 更新

- **自动更新**：启动时自动检查 GitHub Releases，发现新版本会弹出通知，点击即可安装
- **手动更新**：下载新版安装包，覆盖安装到同一目录，资源数据（角色、背景、音频）自动保留

> ⚠️ 请勿删除安装目录下的 `data/` 和 `assets/` 文件夹，这些是你的资源库数据。

## 使用指南

### 剧情编辑界面
- 下半部分显示剧情记录列表，支持插入、删除、调整顺序或复制记录
- 左上部分显示当前记录的预览图和进度条
- 右上部分为属性编辑区，包含文本、立绘、背景、特效和音效等标签页
- 全局设置页面可设置项目参数，如音量、剧情类型等

### 资源管理界面
- 角色管理：编辑角色信息、立绘列表和属性
- 背景管理：管理背景图片和标签
- 音效管理：管理音频资源和分类
- 支持搜索、筛选功能

### 文本转剧情功能
- 支持将特定格式的文本转换为剧情记录
- 格式示例：
  ```
  [BGM名称]
  {背景图片名称}
  说话人: 对话内容(情绪)%位置%
  旁白: 对话内容
  ```
- `%位置%`：角色在画面中横向的位置，用百分比填写，`%0%` 最左，`%50%` 画面中间，`%100%` 最右。不写则默认居中。
- 说话人冒号兼容半角 `:` 与全角 `：`，情绪括号兼容半角 `()` 与全角 `（）`，位置标记的百分号兼容 `%` 与 `％`。

## 技术架构

### 后端
- **Java 21**: 核心开发语言
- **Spring Boot 3.2.0**: 应用框架
- **JavaCV**: 视频处理和合成
- **SQLite + JDBI**: 数据持久化
- **Jackson**: JSON 数据处理

### 前端
- **React 19**: 用户界面框架
- **Electron 39**: 桌面应用封装
- **Axios**: HTTP 客户端

## 开发环境搭建

### 环境要求
- Java 21 或更高版本
- Maven 3.6+
- Node.js 18+ 和 npm
- FFmpeg（用于视频处理）

### 一键启动（推荐）

运行 `demo` 目录下的 `start_all.bat`（根目录下的 `start_all.bat - 快捷方式.lnk` 指向它）：

```bat
demo\start_all.bat
```

此脚本会依次检查环境、启动后端、安装前端依赖、启动前端 Electron 应用。

### 分别启动

#### 后端
```bash
cd e:/LimbusCompanyPlotVideoGenerator/demo
mvn spring-boot:run
```

#### 前端
```bash
cd e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app
npm install
npm run electron-dev
```

## 项目结构

```
LimbusCompanyPlotVideoGenerator/
├── demo/                           # 后端 + 前端源码
│   ├── src/main/java/              # Spring Boot 后端
│   ├── frontend/electron-react-app/# Electron + React 前端
│   ├── assets/                     # 素材资源
│   ├── data/                       # 数据库文件
│   ├── pom.xml                     # Maven 配置
│   ├── start_all.bat               # 一键启动（前后端）
│   └── build-package.bat           # 本地打包脚本
├── docs/                           # 项目文档
└── .github/workflows/              # CI/CD
```

## 文档

- [项目文档](docs/项目文档.md) - 模块结构与总体设计
- [代码导航指南](docs/代码导航指南.md) - 按功能/问题定位代码
- [前端架构文档](docs/前端架构文档.md) - 组件层级与数据流
- [前端模型](docs/前端模型.md) - 前后端数据模型字段
- [API文档](docs/API文档.md) - REST 接口说明
- [配置文档](docs/配置文档.md) - 后端与前端配置项
- [本地打包说明](docs/本地打包说明.md) - 出安装包的完整流程与坑
- [版本更新笔记](docs/版本更新笔记.md) - 各版本改动

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 维护者

- qbbb718

## 许可证

本项目采用 MIT 许可证（见 `package.json` 的 `license` 字段）。

## 致谢

- 感谢月海伦娜和边狱公司中文wiki提供的游戏素材
- 感谢所有开源项目的贡献者

