# 边境公司剧情视频生成器 (LimbusCompanyPlotVideoGenerator)

[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.0-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Electron](https://img.shields.io/badge/Electron-27-blue.svg)](https://www.electronjs.org/)

一个用于自动生成《边狱公司》(Limbus Company) 剧情视频的工具，支持将剧情脚本转换为包含人物立绘、背景、音效和配音的完整视频。

## 功能特点


See project-specific documentation in demo/src/main/resources/docs/. For current priorities, see docs/TODO.md.
## 技术架构
### 后端
- **Java 21**: 核心开发语言
- **Spring Boot 3.2.0**: 应用框架
- **JavaCV**: 视频处理和合成
- **SQLite + JDBI**: 数据持久化
- **Jackson**: JSON数据处理
- **SLF4J + Logback**: 日志管理。后端日志文件会输出到 `demo/logs/log-<timestamp>.log`。

### 前端
- **React 18**: 用户界面框架
- **Electron**: 桌面应用封装
- **Material-UI**: UI组件库
- **Axios**: HTTP客户端
- **react-beautiful-dnd**: 拖拽功能

## 安装与运行

### 环境要求
- Java 21 或更高版本
- Maven 3.6+
- Node.js 16+ 和 npm
- FFmpeg (用于视频处理)

### 一键启动（推荐）

运行项目根目录下的 `start_all.bat` 脚本即可一键启动后端和前端：

```bash
e:/LimbusCompanyPlotVideoGenerator/start_all.bat
```

此脚本会自动：
1. 检查Java、Maven和Node.js环境
2. 启动后端Spring Boot服务（启动时会清理旧数据库文件并确保使用 `demo/data/project.db`）
3. 安装前端依赖（如果需要）
4. 启动前端Electron应用

   启动后，前端会在 `demo/frontend/electron-react-app/logs/` 目录生成一个带时间戳的 `frontend-*.log` 文件，包含主进程和渲染进程的 console 输出，用于排查问题。

### 分别启动

#### 后端启动
1. 进入项目目录
```bash
cd e:/LimbusCompanyPlotVideoGenerator/demo
```

2. 使用Maven启动Spring Boot应用
```bash
mvn spring-boot:run
```

或者直接运行批处理文件
```bash
e:/LimbusCompanyPlotVideoGenerator/demo/run_bootstrap.bat
```

#### 前端启动
1. 进入前端应用目录
```bash
cd e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app
```

2. 安装依赖
```bash
npm install
```

3. 启动开发环境
```bash
npm run electron-dev
```

## 项目结构

**为了简化维护，所有可变数据集中在 `demo/data`，后台日志存放于 [demo/logs](demo/logs)，前端日志在 [demo/frontend/electron-react-app/logs](demo/frontend/electron-react-app/logs)。**



```
LimbusCompanyPlotVideoGenerator/
├── demo/                    # 后端应用
│   ├── data/               # 数据库文件
│   ├── frontend/           # 前端应用
│   │   ├── demo.html       # 简单HTML演示
│   │   └── electron-react-app/ # Electron+React应用
│   ├── src/                # Java源代码
│   │   └── main/           # 主要源代码
│   ├── pom.xml             # Maven配置
│   └── run_*.bat           # 启动脚本
├── note/                   # 项目文档
│   ├── FRONTEND_MODEL.md   # 前端模型文档
│   └── PROJECT_CONTEXT.md  # 项目上下文
├── src/                    # 前端组件源码
│   └── components/         # React组件
└── package.json            # 前端依赖配置
```

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
- 支持搜索、筛选和拖拽排序功能

### 文本转剧情功能
- 支持将特定格式的文本转换为剧情记录
- 格式示例：
  ```
  [BGM名称]
  {背景图片名称}
  说话人: 对话内容(情绪)
  旁白: 对话内容
  ```

## 文档

- [配置文档](docs/CONFIG_DOCUMENTATION.md) - 详细说明后端配置文件的用途和配置方法
- [前端模型文档](note/FRONTEND_MODEL.md) - 前端数据模型和组件结构说明
- [项目上下文](note/PROJECT_CONTEXT.md) - 项目背景和设计理念
- [TODO 列表](docs/TODO.md) - 当前开发任务和优先级

## 开发指南

### 后端开发
- 使用Maven管理依赖
- 遵循Spring Boot最佳实践
- 数据库操作使用JDBI
- 视频处理使用JavaCV

### 前端开发
- 基于React和Material-UI构建界面
- 使用Electron封装为桌面应用
- 通过Axios与后端API通信
- 支持拖拽功能的交互设计

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

