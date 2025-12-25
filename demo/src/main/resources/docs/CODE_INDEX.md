# 代码索引 - LimbusCompanyPlotVideoGenerator

本文档提供代码库的索引，帮助AI助手快速定位相关代码部分。

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

## 使用指南

当需要查找特定功能的代码实现时:

1. **查找功能实现**: 先在"功能实现映射"部分找到对应功能，然后查看相关组件和API
2. **查找API实现**: 在"API端点索引"部分找到API，然后查看对应的后端实现
3. **查找组件**: 在"前端组件索引"部分找到组件，然后查看对应的文件路径
4. **查找数据模型**: 在"数据模型索引"部分找到模型，了解其结构和关联关系

## 更新日志

- 2025-07-07: 创建初始索引文档
