# 代码导航与搜索指南 - LimbusCompanyPlotVideoGenerator

本文档提供代码库的索引和搜索策略，帮助快速定位相关代码部分。

## 项目结构概览

```
LimbusCompanyPlotVideoGenerator/
├── demo/                      # 后端应用
│   ├── src/main/java/         # Java后端代码
│   ├── src/main/resources/    # 资源文件
│   └── frontend/              # 前端应用
│       └── electron-react-app/
├── src/                       # 前端代码
│   └── components/            # React组件
└── note/                      # 项目文档
```

## 代码导航策略

### 1. 功能导向导航

当需要实现某个功能时，按照以下步骤导航：

1. **关键词搜索**：使用功能相关的关键词进行搜索
   - 示例：搜索"文本转剧情"、"视频渲染"、"资源管理"等

2. **模块定位**：根据模块索引定位相关代码
   - 示例：文本转剧情功能在"剧情处理模块"中

3. **API查找**：在API端点索引中查找相关API
   - 示例：文本转剧情对应API为`POST /api/plots/parse`

4. **实现追踪**：从API端点追踪到具体实现代码
   - 示例：从`PlotController.parseText()`到`PlotParser.parseText()`

### 2. 问题导向导航

当需要修复某个问题时，按照以下步骤导航：

1. **错误信息搜索**：使用错误信息中的关键词进行搜索
   - 示例：搜索"UnsatisfiedLinkError"、"NullPointerException"等

2. **日志关联**：查看日志文件，定位出错的代码位置
   - 示例：查看日志中的堆栈跟踪，定位到具体类和方法

3. **版本对比**：如果是引入新问题，对比代码变更
   - 示例：使用Git对比最近的代码变更

### 3. 组件关联导航

当需要修改某个组件时，按照以下步骤导航：

1. **组件定位**：在组件索引中查找组件位置
   - 示例：ResourceManager组件在`src/components/ResourceManager.tsx`

2. **依赖分析**：分析组件的依赖关系
   - 示例：ResourceManager依赖哪些API、哪些数据模型

3. **影响评估**：评估修改可能影响的其他组件
   - 示例：修改ResourceManager可能影响PlotEditor中的资源选择

## 搜索技巧

### 1. 关键词组合

使用多个关键词组合进行精确搜索：

- **功能+类型**：如"剧情解析器"、"视频渲染器"
- **模块+功能**：如"音频模块处理"、"资源模块加载"
- **API+功能**：如"角色API"、"背景API"

### 2. 文件类型过滤

根据需要搜索特定类型的文件：

- **Java后端**：搜索`.java`文件
- **React组件**：搜索`.tsx`文件
- **样式文件**：搜索`.css`或`.scss`文件
- **配置文件**：搜索`.xml`、`.json`或`.properties`文件

### 3. 路径模式

使用路径模式缩小搜索范围：

- **后端代码**：搜索`demo/src/main/java/`路径
- **前端代码**：搜索`src/`路径
- **资源文件**：搜索`demo/src/main/resources/`路径

### 4. 注释标签

利用注释标签进行定向搜索：

- 搜索`@module`标签查找特定模块
- 搜索`@function`标签查找特定功能
- 搜索`@api`标签查找特定API
- 搜索`@model`标签查找特定数据模型

## 后端模块索引

### 核心模块

1. **剧情处理模块**
   - 路径: `demo/src/main/java/com/lbc_plot/core/plot/`
   - 功能: 处理剧情数据、解析文本、生成Record对象
   - 主要类:
     - `PlotParser`: 文本解析器，将纯文本转换为Record对象
     - `PlotManager`: 剧情管理器，管理Record集合

2. **视频渲染模块**
   - 路径: `demo/src/main/java/com/lbc_plot/core/render/`
   - 功能: 将Record对象渲染为视频帧
   - 主要类:
     - `Renderer`: 主渲染器
     - `FrameComposer`: 帧合成器
     - `TextRenderer`: 文本渲染器
     - `ImageRenderer`: 图像渲染器

3. **音频处理模块**
   - 路径: `demo/src/main/java/com/lbc_plot/core/audio/`
   - 功能: 处理音频、生成时间线
   - 主要类:
     - `AudioProcessor`: 音频处理器
     - `AudioTimeline`: 音频时间线
     - `AudioCommand`: 音频命令

4. **资源管理模块**
   - 路径: `demo/src/main/java/com/lbc_plot/core/storage/`
   - 功能: 管理角色、背景、音频等资源
   - 主要类:
     - `ResourceManager`: 资源管理器
     - `CharacterStorage`: 角色存储
     - `BackgroundStorage`: 背景存储
     - `AudioStorage`: 音频存储

### API端点索引

1. **剧情相关API**
   - `GET /api/plots`: 获取剧情列表
   - `POST /api/plots`: 创建新剧情
   - `PUT /api/plots/{id}`: 更新剧情
   - `DELETE /api/plots/{id}`: 删除剧情
   - `POST /api/plots/parse`: 解析文本为剧情

2. **资源相关API**
   - `GET /api/resources/characters`: 获取角色列表
   - `POST /api/resources/characters`: 创建新角色
   - `PUT /api/resources/characters/{id}`: 更新角色
   - `DELETE /api/resources/characters/{id}`: 删除角色
   - `GET /api/resources/backgrounds`: 获取背景列表
   - `POST /api/resources/backgrounds`: 上传新背景
   - `DELETE /api/resources/backgrounds/{id}`: 删除背景
   - `GET /api/resources/audio`: 获取音频列表
   - `POST /api/resources/audio`: 上传新音频
   - `DELETE /api/resources/audio/{id}`: 删除音频

3. **渲染相关API**
   - `POST /api/render/video`: 渲染视频
   - `GET /api/render/status/{jobId}`: 获取渲染状态
   - `GET /api/result/{jobId}`: 获取渲染结果

## 前端组件索引

### 主要React组件

1. **ResourceManager**
   - 路径: `src/components/ResourceManager.tsx`
   - 功能: 资源管理界面，管理角色、背景、音频
   - 子组件:
     - 背景管理: 添加、删除、排序、标签管理
     - 音效管理: 添加、删除、排序、标签管理
     - 角色管理: 添加、编辑角色，管理立绘

2. **PlotEditor**
   - 路径: `src/components/PlotEditor.tsx`
   - 功能: 剧情编辑界面
   - 子组件:
     - Record列表: 表格形式展示剧情记录
     - Record预览: 预览当前选中的剧情记录
     - Record编辑: 编辑当前选中的剧情记录

3. **TextToRecords**
   - 路径: `src/components/TextToRecords.tsx`
   - 功能: 文本转剧情界面
   - 功能: 解析纯文本为剧情记录

4. **Settings**
   - 路径: `src/components/Settings.tsx`
   - 功能: 应用设置界面
   - 设置项: 保存路径、主题等

## 数据模型索引

### 核心数据模型

1. **Record**
   - 描述: 剧情记录，包含对白、摄像机、背景、角色、特效与音频等
   - 字段: uuid, durationFrames, dialogue, camera, bg, chars, effects, audioCommands, isDirty
   - 关联: Dialogue, BackgroundVisual, CharacterVisual, EffectVisual, AudioCommand

2. **Dialogue**
   - 描述: 对白文本，包含说话人、位置、对齐、速度、情绪等
   - 字段: text, location, speakerC, speakerName, faction, align, speed, emotion
   - 关联: CharacterRef

3. **CharacterVisual**
   - 描述: 角色立绘的可视化表示
   - 字段: chara, portrait, posX, posY, adjX, adjY, dim
   - 关联: CharacterRef, Portrait

4. **BackgroundVisual**
   - 描述: 背景资源与显示属性
   - 字段: background, posX, posY, scale, visible
   - 关联: Background

5. **AudioCommand**
   - 描述: 音频命令/片段
   - 字段: audioType, path, volume, startTime, duration
   - 关联: AudioStorage

## 功能实现映射

### 1. 文本转剧情功能
- 前端组件: `TextToRecords`
- 后端API: `POST /api/plots/parse`
- 后端实现: `PlotParser.parseText()`

### 2. 资源管理功能
- 前端组件: `ResourceManager`
- 后端API: `/api/resources/*`
- 后端实现: `ResourceManager`, `CharacterStorage`, `BackgroundStorage`, `AudioStorage`

### 3. 剧情编辑功能
- 前端组件: `PlotEditor`
- 后端API: `/api/plots/*`
- 后端实现: `PlotManager`

### 4. 视频渲染功能
- 前端组件: `PlotEditor`中的渲染按钮
- 后端API: `POST /api/render/video`
- 后端实现: `Renderer`, `FrameComposer`, `AudioProcessor`

## 常见搜索场景

### 1. 实现新功能

**场景**：需要实现"导出剧情为PDF"功能

**搜索步骤**：
1. 搜索"导出"相关代码
2. 搜索"PDF"相关库或实现
3. 查看API端点索引中的"渲染相关API"
4. 分析现有视频渲染流程，参考实现PDF导出

### 2. 修复Bug

**场景**：角色立绘显示位置不正确

**搜索步骤**：
1. 搜索"立绘"、"位置"、"坐标"等关键词
2. 查看数据模型索引中的"CharacterVisual"模型
3. 搜索前端ResourceManager中的立绘编辑相关代码
4. 搜索后端渲染器中的角色渲染相关代码

### 3. 优化性能

**场景**：视频渲染速度慢

**搜索步骤**：
1. 搜索"渲染"、"性能"、"优化"等关键词
2. 查看模块索引中的"视频渲染模块"
3. 分析渲染流程中的瓶颈点
4. 搜索缓存、多线程等优化相关实现

## 搜索工具使用

### 1. 代码搜索命令

使用项目支持的搜索命令：

```
# 搜索关键词
frontend_server.search_dir(search_term="关键词", dir_path="项目路径")

# 搜索文件
frontend_server.find_by_name(SearchDirectory="项目路径", Pattern="文件模式")
```

### 2. 文件查看命令

使用项目支持的文件查看命令：

```
# 查看文件内容
frontend_server.view_file(file_path="文件路径")

# 查看目录结构
frontend_server.list_dir(dir_path="目录路径", mode="tree")
```

## 搜索最佳实践

1. **先全局后局部**：先了解全局结构，再深入具体代码
2. **多关键词组合**：使用多个关键词组合进行精确搜索
3. **关联分析**：不仅搜索直接相关的代码，还要分析关联代码
4. **注释辅助**：利用结构化注释快速定位代码功能
5. **版本追踪**：使用版本控制工具追踪代码变更历史

## 搜索效率提升

1. **建立搜索关键词库**：记录常用的搜索关键词和模式
2. **创建代码片段库**：记录常用的代码片段和实现模式
3. **维护搜索日志**：记录搜索过程和结果，便于后续参考
4. **定期更新索引**：随着项目发展，定期更新代码索引

## 更新日志

- 2025-07-07: 创建初始索引文档
- 2025-10-19: 合并代码搜索指南，创建统一的代码导航与搜索指南
