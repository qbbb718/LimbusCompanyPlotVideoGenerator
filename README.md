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
  说话人: 对话内容(情绪)
  旁白: 对话内容
  ```

## 技术架构

### 后端
- **Java 21**: 核心开发语言
- **Spring Boot 3.2.0**: 应用框架
- **JavaCV**: 视频处理和合成
- **SQLite + JDBI**: 数据持久化
- **Jackson**: JSON 数据处理

### 前端
- **React 18**: 用户界面框架
- **Electron 39**: 桌面应用封装
- **Axios**: HTTP 客户端

## 开发环境搭建

### 环境要求
- Java 21 或更高版本
- Maven 3.6+
- Node.js 18+ 和 npm
- FFmpeg（用于视频处理）

### 一键启动（推荐）

运行项目根目录下的 `start_all.bat`：

```bash
e:/LimbusCompanyPlotVideoGenerator/start_all.bat
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
├── demo/                           # 后端应用
│   ├── data/                       # 数据库文件
│   ├── assets/                     # 素材资源
│   ├── frontend/                   # 前端应用
│   │   └── electron-react-app/     # Electron + React 应用
│   ├── src/                        # Java 源代码
│   ├── pom.xml                     # Maven 配置
│   └── build-package.bat           # 打包脚本
├── note/                           # 项目文档
│   ├── FRONTEND_MODEL.md
│   └── PROJECT_CONTEXT.md
└── .github/workflows/              # CI/CD
```

## 文档

- [配置文档](docs/CONFIG_DOCUMENTATION.md) - 后端配置文件说明
- [前端模型文档](note/FRONTEND_MODEL.md) - 前端数据模型和组件结构
- [项目上下文](note/PROJECT_CONTEXT.md) - 项目背景和设计理念
- [TODO 列表](docs/TODO.md) - 当前开发任务和优先级

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 维护者

- qbbb718

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 致谢

- 感谢月海伦娜和边狱公司中文wiki提供的游戏素材
- 感谢所有开源项目的贡献者

