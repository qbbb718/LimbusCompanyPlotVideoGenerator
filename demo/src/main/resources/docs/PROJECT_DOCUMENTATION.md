# 边境公司剧情视频生成器项目文档

## 项目概述

边境公司剧情视频生成器(LimbusCompanyPlotVideoGenerator)是一个用于自动生成《边狱公司》(Limbus Company)剧情视频的工具。该项目支持将剧情脚本转换为包含人物立绘、背景、音效和配音的完整视频。

## 技术架构

### 后端技术栈
- Java 21: 核心开发语言
- Spring Boot 3.2.0: 应用框架
- JavaCV: 视频处理和合成
- SQLite + JDBI: 数据持久化
- Jackson: JSON数据处理
- SLF4J + Logback: 日志管理

### 前端技术栈
- React 18: 用户界面框架
- Electron: 桌面应用封装
- Material-UI: UI组件库
- Axios: HTTP客户端
- react-beautiful-dnd: 拖拽功能

## 项目结构

```
LimbusCompanyPlotVideoGenerator/
├── demo/                         # 后端应用
│   ├── data/                     # 数据库文件
│   │   ├── character_cards/      # 角色卡片数据
│   │   └── project.db            # SQLite数据库
│   ├── frontend/                 # 前端应用
│   │   ├── demo.html             # 简单HTML演示
│   │   └── electron-react-app/   # Electron+React应用
│   ├── src/                      # Java源代码
│   │   └── main/                 # 主要源代码
│   │       ├── java/             # Java代码
│   │       │   └── com/lbc_plot/
│   │       │       ├── DAO/      # 数据访问对象
│   │       │       ├── config/   # 配置类
│   │       │       ├── controller/# 控制器
│   │       │       ├── core/     # 核心功能
│   │       │       ├── filter/   # 过滤器
│   │       │       ├── main/     # 主程序入口
│   │       │       ├── model/    # 数据模型
│   │       │       ├── service/  # 服务层
│   │       │       └── util/     # 工具类
│   │       └── resources/        # 资源文件
│   │           ├── assets/        # 静态资源
│   │           ├── audio/         # 音频文件
│   │           ├── db/            # 数据库脚本
│   │           └── docs/          # 项目文档
│   ├── pom.xml                   # Maven配置
│   └── run_*.bat                 # 启动脚本
├── note/                         # 项目文档
│   ├── CODE_COMMENTING_GUIDE.md  # 代码注释指南
│   ├── CODE_INDEX.md             # 代码索引
│   ├── CODE_SEARCH_GUIDE.md      # 代码搜索指南
│   ├── FRONTEND_MODEL.md         # 前端模型文档
│   └── PROJECT_CONTEXT.md        # 项目上下文
├── package.json                  # 前端依赖配置
└── README.md                     # 项目说明
```

## 核心功能模块

### 1. 剧情编辑模块
- 功能：提供剧情记录编辑界面，支持对白、角色、背景、特效和音频的全面编辑
- 实现：PlotEditor组件、PlotController、Record模型
- 主要API：`/api/plots/*`

### 2. 资源管理模块
- 功能：集中管理角色立绘、背景图片和音频资源
- 实现：ResourceManager组件、CharacterController、BackgroundController、AudioController
- 主要API：`/api/resources/*`

### 3. 文本转剧情模块
- 功能：支持将纯文本脚本自动转换为剧情记录
- 实现：TextToRecords组件、PlotParser
- 主要API：`POST /api/plots/parse`

### 4. 视频渲染模块
- 功能：将剧情记录渲染为视频帧并合成最终视频
- 实现：Renderer、FrameComposer、AudioProcessor
- 主要API：`POST /api/render/video`

## 数据模型

### 核心数据模型
1. **Record**: 剧情记录，包含对白、摄像机、背景、角色、特效与音频等
2. **Dialogue**: 对白文本，包含说话人、位置、对齐、速度、情绪等
3. **CharacterVisual**: 角色立绘的可视化表示
4. **BackgroundVisual**: 背景资源与显示属性
5. **AudioCommand**: 音频命令/片段

### 资源模型
1. **MyCharacter**: 完整的角色实体
2. **Portrait**: 立绘数据
3. **Background**: 背景资源
4. **Audio**: 音频资源

## 安装与运行

### 环境要求
- Java 21 或更高版本
- Maven 3.6+
- Node.js 16+ 和 npm
- FFmpeg (用于视频处理)

### 一键启动
运行项目根目录下的 `start_all.bat` 脚本即可一键启动后端和前端。

### 分别启动
1. 后端启动: `cd demo && mvn spring-boot:run`
2. 前端启动: `cd demo/frontend/electron-react-app && npm run electron-dev`

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

## 项目文档

项目包含以下详细文档，位于note目录下：
- CODE_COMMENTING_GUIDE.md: 代码注释指南
- CODE_INDEX.md: 代码索引
- CODE_SEARCH_GUIDE.md: 代码搜索指南
- FRONTEND_MODEL.md: 前端模型文档
- PROJECT_CONTEXT.md: 项目上下文

## 维护者

- qbbb718
