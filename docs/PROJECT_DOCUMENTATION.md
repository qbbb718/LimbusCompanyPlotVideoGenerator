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
│   ├── CODE_NAVIGATION_GUIDE.md  # 代码导航与搜索指南
│   ├── FRONTEND_MODEL.md         # 前端模型文档
│   └── PROJECT_DOCUMENTATION.md   # 项目文档
├── package.json                  # 前端依赖配置
└── README.md                     # 项目说明
```

## 后端模块化重构详情

### 模块概览

```
LimbusCompanyPlotVideoGenerator/
├── plot/                         # 剧情处理模块 ✅
│   ├── controller/               # 剧情相关控制器
│   ├── service/                  # 剧情业务逻辑
│   ├── model/                    # 剧情数据模型
│   └── parser/                   # 文本解析器
├── resource/                     # 资源管理模块 ✅
│   ├── controller/               # 资源相关控制器
│   ├── service/                  # 资源业务逻辑
│   ├── model/                    # 资源数据模型
│   ├── storage/                  # 资源存储实现
│   └── character/                # 角色子模块
├── render/                       # 视频渲染模块 ✅
│   ├── controller/               # 渲染相关控制器
│   ├── service/                  # 渲染业务逻辑
│   ├── engine/                   # 渲染引擎
│   ├── audio/                    # 音频处理
│   └── video/                    # 视频处理
├── config/                       # 配置模块 ✅
│   ├── ProjectConfig.java
│   ├── StorageConfig.java
│   ├── WebConfig.java
│   └── AsyncQueueConfig.java
├── common/                       # 公共模块 ✅
│   ├── model/                    # 通用数据模型
│   ├── util/                     # 工具类
│   ├── exception/                # 异常处理
│   └── security/                 # 安全相关
└── LimbusCompanyPlotVideoGeneratorApplication.java
```

### 模块职责详细说明

#### 剧情处理模块 (plot)

**职责**：负责剧情的创建、编辑、解析和管理。

**核心类**：
- `PlotController`：处理剧情相关的HTTP请求
- `PlotService`：实现剧情业务逻辑
- `PlotParser`：将文本解析为剧情记录
- `Record`：剧情记录数据模型
- `Dialogue`：对话数据模型

**API端点**：
- `GET /api/plots`：获取剧情列表
- `POST /api/plots`：创建新剧情
- `PUT /api/plots/{id}`：更新剧情
- `DELETE /api/plots/{id}`：删除剧情
- `POST /api/plots/parse`：解析文本为剧情

#### 资源管理模块 (resource)

**职责**：管理角色、背景、音频等资源。

**核心类**：
- `ResourceService`：统一资源服务接口
- `CharacterService`：角色管理服务
- `BackgroundService`：背景管理服务
- `AudioService`：音频管理服务
- `MyCharacter`：角色数据模型
- `Background`：背景数据模型
- `Audio`：音频数据模型

**API端点**：
- `GET /api/resources/characters`：获取角色列表
- `POST /api/resources/characters`：创建新角色
- `PUT /api/resources/characters/{id}`：更新角色
- `DELETE /api/resources/characters/{id}`：删除角色
- `GET /api/resources/backgrounds`：获取背景列表
- `POST /api/resources/backgrounds`：上传新背景
- `DELETE /api/resources/backgrounds/{id}`：删除背景
- `GET /api/resources/audio`：获取音频列表
- `POST /api/resources/audio`：上传新音频
- `DELETE /api/resources/audio/{id}`：删除音频

#### 视频渲染模块 (render)

**职责**：将剧情记录渲染为视频。

**核心类**：
- `RenderService`：渲染服务接口
- `AsyncRenderService`：异步渲染服务接口
- `PersistentFileAsyncRenderService`：基于文件的持久化异步渲染实现
- `RedisPersistentAsyncRenderService`：基于Redis的持久化异步渲染实现
- `Renderer`：视频渲染器
- `FrameComposer`：帧合成器
- `AudioProcessor`：音频处理器

**API端点**：
- `POST /api/render/video`：渲染视频
- `GET /api/render/status/{jobId}`：获取渲染状态
- `GET /api/result/{jobId}`：获取渲染结果

#### 配置模块 (config)

**职责**：管理应用配置。

**核心类**：
- `ProjectConfig`：项目配置类
- `StorageConfig`：存储配置类
- `WebConfig`：Web配置类
- `AsyncQueueConfig`：异步队列配置类

#### 公共模块 (common)

**职责**：提供通用功能和工具。

**核心类**：
- `BaseEntity`：基础实体类
- `ApiResponse`：API响应封装
- `FileUtils`：文件操作工具
- `ImageUtils`：图像处理工具
- `GlobalExceptionHandler`：全局异常处理器

### 模块间依赖关系

```
plot → resource, common, config
resource → common, config
render → plot, resource, common, config
config → (无依赖)
common → (无依赖)
```

### 重构成果

后端模块化重构已成功完成，实现了以下目标：

1. **模块结构清晰**：已按照规划创建了plot、resource、render、common和config五个主要模块
2. **代码组织合理**：相关功能已集中在对应模块中，提高了代码的内聚性
3. **依赖关系明确**：模块间通过接口交互，降低了耦合度
4. **配置统一管理**：所有配置类集中在config模块，便于维护
5. **公共功能复用**：通用工具和异常处理集中在common模块，避免重复代码

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

## 快速命令
- 验证 Java/Maven 环境:
  - `java -version`
  - `mvn -v`
- 构建 demo 模块:
  - `cd demo`
  - `mvn -DskipTests=true clean package`
- 构建 backend 模块 (示例):
  - `mvn -pl demo/backend -am clean package`
- 运行测试:
  - `mvn -DskipTests=false test`

## 注意事项 / 已知问题
- `demo` 模块当前没有源代码会导致输出 JAR 为空（这不是错误，只是目录结构所致）。
- JNI/native 依赖（例如 JavaCV/Javacpp bindings、FFmpeg）可能需要升级或与系统平台匹配；如果构建或运行时出现 UnsatisfiedLinkError 或 native lib 相关错误，请检查本机的依赖版本和本机库（例如 OpenCV/FFmpeg）支持。
- 在升级 Java 到 21 后，如果遇到编译或运行错误，请先检查 maven-surefire/failsafe 插件和任何本机依赖的兼容性。

## 重要变更（2025-10-19）
- 已将 `demo/pom.xml` 的 Java 版本从 17 升级为 21，并添加了 `maven-compiler-plugin`（<release>21</release>）。
- 移除 `demo/pom.xml` 中重复的 `org.bytedeco:javacv-platform` 依赖。
- 完成后端模块化重构，将代码重组为plot、resource、render、common和config五个主要模块。

## 项目文档

项目包含以下详细文档，位于note目录下：
- CODE_COMMENTING_GUIDE.md: 代码注释指南
- CODE_NAVIGATION_GUIDE.md: 代码导航与搜索指南
- FRONTEND_MODEL.md: 前端模型文档
- PROJECT_DOCUMENTATION.md: 项目文档

## 如何让 AI 助手记住更多
- 把关键信息写到 `PROJECT_DOCUMENTATION.md` 或 README，下一次打开仓库时我会读取并恢复上下文。不要在该文件中写入敏感信息（密钥/密码）。

## 下一步建议
- 若要继续升级其他模块（例如 `demo/backend`），请让我扫描并给出每个模块的升级补丁或你可以在本地运行 `mvn -pl demo/backend -am clean package` 并把错误日志贴上来。

## 维护者/联系方式
- 维护者: qbbb718
