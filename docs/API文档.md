- [API 文档](#api-文档)
  - [目录](#目录)
  - [1. 健康检查与系统](#1-健康检查与系统)
    - [健康检查](#健康检查)
    - [初始化音频系统](#初始化音频系统)
  - [2. 剧情记录 (Records)](#2-剧情记录-records)
    - [获取所有记录](#获取所有记录)
    - [创建新记录](#创建新记录)
    - [更新记录](#更新记录)
    - [删除记录](#删除记录)
    - [文本转记录](#文本转记录)
    - [导入记录](#导入记录)
    - [导出记录](#导出记录)
    - [生成视频](#生成视频)
  - [3. 角色 (Characters)](#3-角色-characters)
    - [获取所有角色](#获取所有角色)
    - [添加新角色](#添加新角色)
    - [更新角色](#更新角色)
    - [删除角色](#删除角色)
    - [导出角色](#导出角色)
    - [导入角色](#导入角色)
  - [4. 立绘 (Portraits)](#4-立绘-portraits)
    - [添加立绘](#添加立绘)
    - [更新立绘](#更新立绘)
    - [删除立绘](#删除立绘)
    - [设置默认立绘](#设置默认立绘)
    - [渲染立绘预览图](#渲染立绘预览图)
  - [5. 背景 (Backgrounds)](#5-背景-backgrounds)
    - [获取所有背景](#获取所有背景)
    - [获取单个背景](#获取单个背景)
    - [获取背景资源文件](#获取背景资源文件)
    - [获取背景缩略图](#获取背景缩略图)
    - [上传背景文件](#上传背景文件)
    - [添加背景](#添加背景)
    - [更新背景](#更新背景)
    - [删除背景](#删除背景)
    - [上传背景缩略图](#上传背景缩略图)
    - [导出背景](#导出背景)
    - [导入背景](#导入背景)
  - [6. 音频 (Audios)](#6-音频-audios)
    - [获取所有音频](#获取所有音频)
    - [添加音频](#添加音频)
    - [更新音频](#更新音频)
    - [删除音频](#删除音频)
    - [获取音频文件](#获取音频文件)
    - [导出音频](#导出音频)
    - [导入音频](#导入音频)
  - [7. 角色名片 (Character Cards)](#7-角色名片-character-cards)
    - [获取角色名片图片](#获取角色名片图片)
    - [用当前参数预览角色名片](#用当前参数预览角色名片)
  - [8. 异步渲染任务 (Async Jobs)](#8-异步渲染任务-async-jobs)
    - [获取任务状态](#获取任务状态)
    - [获取任务详情](#获取任务详情)
    - [获取失败任务](#获取失败任务)
  - [9. 资源包 (Resource Bundle)](#9-资源包-resource-bundle)
    - [导出全部资源](#导出全部资源)
    - [导入全部资源](#导入全部资源)
    - [资源包结构](#资源包结构)
  - [通用响应格式](#通用响应格式)
    - [成功响应](#成功响应)
    - [错误响应](#错误响应)
  - [CORS 配置](#cors-配置)


# API 文档

本文档列出后端提供的所有 REST API 端点，供前端或第三方调用参考。

**基础URL**: `http://localhost:8081/api`

---

## 目录

1. [健康检查与系统](#1-健康检查与系统)
2. [剧情记录 (Records)](#2-剧情记录-records)
3. [角色 (Characters)](#3-角色-characters)
4. [立绘 (Portraits)](#4-立绘-portraits)
5. [背景 (Backgrounds)](#5-背景-backgrounds)
6. [音频 (Audios)](#6-音频-audios)
7. [角色名片 (Character Cards)](#7-角色名片-character-cards)
8. [异步渲染任务 (Async Jobs)](#8-异步渲染任务-async-jobs)

---

## 1. 健康检查与系统

### 健康检查
- **URL**: `GET /health`
- **说明**: 检查后端服务是否正常运行
- **响应**: `Object` - 状态信息
```json
{
  "status": "UP",
  "timestamp": 1722470400000
}
```

### 初始化音频系统
- **URL**: `GET /init-audio`
- **说明**: 初始化音频处理系统（实际调用端点，由AudioController提供）
- **响应**: `Object` - 初始化结果
```json
{
  "status": "success",
  "message": "音频系统初始化成功"
}
```
- **备用端点**: `GET /plot-video/init-audio` (返回String格式，由PlotVideoController提供)

---

## 2. 剧情记录 (Records)

### 获取所有记录
- **URL**: `GET /records`
- **说明**: 获取所有剧情记录列表
- **响应**: `List<Record>`

### 创建新记录
- **URL**: `POST /records`
- **说明**: 创建新的剧情记录
- **请求体**: `Record` JSON 对象
- **响应**: `Record` - 创建后的记录

### 更新记录
- **URL**: `PUT /records/{id}`
- **说明**: 更新指定ID的剧情记录
- **路径参数**: `id` - 记录UUID
- **请求体**: `Record` JSON 对象
- **响应**: `Record` - 更新后的记录

### 删除记录
- **URL**: `DELETE /records/{id}`
- **说明**: 删除指定ID的剧情记录
- **路径参数**: `id` - 记录UUID

### 文本转记录
- **URL**: `POST /text-to-records`
- **说明**: 将纯文本脚本解析为剧情记录列表
- **请求体**:
```json
{
  "text": "[BGM名称]\n{背景图片名称}\n说话人: 对话内容(情绪)%位置%\n旁白: 对话内容"
}
```
- **`%位置%`**: 可选，角色在画面中横向的位置，用百分比填写，`%0%` 最左，`%50%` 画面中间，`%100%` 最右；不写则默认居中。
  解析后换算为 `CharacterVisual.adjX`（画面宽 1920 时：`%0%` → `-960`，`%50%` → `0`，`%100%` → `+960`）。
  可写在情绪之前或之后（`…(HAPPY)%70%` 与 `…%70%(HAPPY)` 等价）。旧的 `<位置>` 写法已废弃，不再识别。
- **标点兼容**: 说话人冒号兼容半角 `:` 与全角 `：`；情绪括号兼容半角 `()` 与全角 `（）`；位置百分号兼容 `%` 与 `％`；行首行尾的全角空格（U+3000）会被忽略。
- **情绪取值**: 支持英文枚举名/小写 code（`HAPPY` / `happy`）与资源库中文显示名（`开心` / `生气` / `悲伤` / `惊讶` / `困惑` / `害羞` / `受伤` / `正常`）。无法识别的括号内容会保留在正文中，不会被吞掉。
- **响应**: `List<Record>`

### 导入记录
- **URL**: `POST /records/import`
- **说明**: 从JSON文件导入记录
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `List<Record>`

### 导出记录
- **URL**: `POST /records/export`
- **说明**: 导出记录为JSON文件
- **请求体**:
```json
{
  "records": [ ... ]
}
```
- **响应**: 文件下载 (JSON)

### 渲染单条记录的预览图
- **URL**: `POST /records/preview`
- **说明**: 按当前设置把一条记录渲染成 PNG 预览图（结果按 `uuid + 分辨率 + 剧情模式` 缓存在 `projects/temp/previews/`）
- **查询参数**:
  - `width`（默认 1920）/ `height`（默认 1080）- 预览图尺寸
  - `forceRefresh`（默认 false）- 跳过缓存重新渲染
  - `plot`（默认 true）- 是否剧情模式：全局设置里选「剧情」为 `true`，选「人格故事」为 `false`。
    该值直接传给 `RenderOfImage.renderPre(record, plot, width, height)`，两种模式各存一份缓存
- **请求体**: `Record` JSON 对象
- **响应**: PNG 图片字节流

### 生成视频
- **URL**: `POST /generate-video`
- **说明**: 根据记录列表异步生成视频，立即返回 `taskId`，进度用 `GET /generate-video/progress/{taskId}` 轮询
- **请求体**:
```json
{
  "records": [ ... ],
  "outputPath": "E:\\导出目录",
  "width": 1920,
  "height": 1080,
  "frameRate": 30,
  "layerTypes": ["FULL"],
  "keepTempFiles": false,
  "projectName": "我的项目",
  "plot": true
}
```
- **`outputPath`**: 导出目录（不是文件名），目录不存在时后端会创建
- **`layerTypes`**: 导出分层，取值 `FULL` / `UI_ONLY` / `BG_CHARACTERS` / `BACKGROUND_ONLY` / `CHARACTERS_ONLY`，
  分别追加后缀 `_full` / `_ui` / `_bg_characters` / `_bg` / `_characters`（透明层导出 `.mov`，其余 `.mp4`）
- **`projectName`**: 项目名称，作为导出视频文件名前缀（`项目名称_video_<时间戳><后缀>.mp4`）；
  名称里的非法文件名字符会被过滤，为空则不加前缀
- **`plot`**: 是否剧情模式（全局设置的「剧情类型」：剧情 `true` / 人格故事 `false`），
  默认 `true`；该值传给 `BatchVideoProcessor.processRecordList(...)` 影响画面样式
- **响应**: 任务ID（`taskId`）

---

## 3. 角色 (Characters)

### 获取所有角色
- **URL**: `GET /characters`
- **说明**: 获取所有角色列表（包含立绘信息）
- **响应**: `List<MyCharacter>`

### 添加新角色
- **URL**: `POST /characters`
- **说明**: 创建新角色
- **请求体**: `MyCharacter` JSON 对象
- **响应**: `MyCharacter` - 创建后的角色

### 更新角色
- **URL**: `PUT /characters/{id}`
- **说明**: 更新指定ID的角色
- **路径参数**: `id` - 角色ID
- **请求体**: `MyCharacter` JSON 对象
- **响应**: `MyCharacter` - 更新后的角色

### 删除角色
- **URL**: `DELETE /characters/{id}`
- **说明**: 删除指定ID的角色
- **路径参数**: `id` - 角色ID
- **查询参数**: `deleteFiles` (可选, 默认false) - 是否同时删除关联文件

### 导出角色
- **URL**: `POST /characters/export`
- **说明**: 把一个或多个角色打成 ZIP 导出（资源管理 → 角色 → 多选导出）
- **请求体**: 角色 ID 数组；传空数组或不传表示导出全部角色
```json
["char_1762360609515", "char_1762360609516"]
```
- **响应**: ZIP 文件（`characters.json` + 各角色的立绘原图与缩略图）

### 导入角色
- **URL**: `POST /characters/import`
- **说明**: 导入由「导出角色」生成的 ZIP
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `List<MyCharacter>` - 导入后的角色列表
- **说明**: ID 冲突的角色会被分配新 ID（导入是"新增"而不是覆盖已有角色）；包里找不到立绘文件时，
  对应立绘的图片路径会被清空，其余字段照常导入

---

## 4. 立绘 (Portraits)

### 添加立绘
- **URL**: `POST /characters/{characterId}/portraits`
- **说明**: 为指定角色添加立绘
- **路径参数**: `characterId` - 角色ID
- **请求体**: `Portrait` JSON 对象
- **响应**: `Portrait` - 创建后的立绘

### 更新立绘
- **URL**: `PUT /characters/{characterId}/portraits/{portraitId}`
- **说明**: 更新指定角色的立绘
- **路径参数**:
  - `characterId` - 角色ID
  - `portraitId` - 立绘ID
- **请求体**: `Portrait` JSON 对象
- **响应**: `Portrait` - 更新后的立绘

### 删除立绘
- **URL**: `DELETE /characters/{characterId}/portraits/{portraitId}`
- **说明**: 删除指定立绘
- **路径参数**:
  - `characterId` - 角色ID
  - `portraitId` - 立绘ID
- **查询参数**: `deleteFiles` (可选, 默认false) - 是否同时删除文件

### 设置默认立绘
- **URL**: `PUT /characters/{characterId}/portraits/{portraitId}/default`
- **说明**: 将指定立绘设为角色的默认立绘。
  立绘的**文件**在上传接口就已保存，但 portraits 表里的**记录**要等保存角色
  （`PUT /characters/{id}`）才写；所以这里允许带上立绘数据，库里查不到这条记录时
  先用它补写一条记录，再补关联、设默认（不带请求体时查不到仍然报"立绘不存在"）。
- **路径参数**:
  - `characterId` - 角色ID
  - `portraitId` - 立绘ID
- **请求体**: `Portrait` JSON 对象（可选，仅在库里还没有这条立绘记录时用于补写）

### 渲染立绘预览图
- **URL**: `POST /portraits/preview`
- **说明**: 按当前裁剪参数渲染「立绘在画面中的效果」——背景 + 立绘 + 边框 + 界面 UI，
  不渲染台词和角色名片。供「资源管理 → 角色 → 编辑立绘」里的「预览」按钮使用；
  渲染逻辑与视频静态帧一致（复用 `RenderOfImage.renderPreExceptDialogue`）。
- **请求体**: `multipart/form-data`
  - `file`（可选）- 新立绘原图；与 `imagePath` 二选一。新立绘还没上传时直接传文件，
    预览不会往 `assets/characters` 写任何文件（临时文件渲染完即删）
  - `imagePath`（可选）- 已有立绘的相对路径（如 `char_xxx/portrait_xxx.png`）
  - `faceX` / `faceY` / `length` - 当前裁剪框左上角与边长（原图像素）
  - `adjX` / `adjY` - 立绘手动偏移（设计画布像素）
  - `height` - 角色身高（cm），决定立绘纵向落点
  - `backgroundId`（可选）- 预览背景 ID；为空时取背景库第一张
- **响应**: PNG 图片字节流（1920×1080）

---

## 5. 背景 (Backgrounds)

### 获取所有背景
- **URL**: `GET /backgrounds`
- **说明**: 获取所有背景资源列表
- **响应**: `List<Background>`

### 获取单个背景
- **URL**: `GET /backgrounds/{id}`
- **说明**: 获取指定ID的背景信息
- **路径参数**: `id` - 背景UUID
- **响应**: `Background`

### 获取背景资源文件
- **URL**: `GET /backgrounds/{filename:.+}`
- **说明**: 获取背景图片文件
- **路径参数**: `filename` - 文件名
- **响应**: 图片二进制数据

### 获取背景缩略图
- **URL**: `GET /backgrounds/thumbnails/{filename:.+}`
- **说明**: 获取背景缩略图
- **路径参数**: `filename` - 文件名
- **响应**: 图片二进制数据

### 上传背景文件
- **URL**: `POST /backgrounds/upload`
- **说明**: 上传背景图片文件
- **请求体**: `multipart/form-data`
  - `file`: 图片文件
  - `name` (可选): 背景名称
  - `tags` (可选): 标签，逗号分隔
- **响应**: `Background` - 创建后的背景

### 添加背景
- **URL**: `POST /backgrounds`
- **说明**: 添加背景记录（不上传文件）
- **请求体**: `Background` JSON 对象
- **响应**: `Background`

### 更新背景
- **URL**: `PUT /backgrounds/{id}`
- **说明**: 更新背景信息
- **路径参数**: `id` - 背景UUID
- **请求体**: `Background` JSON 对象
- **响应**: `Background`

### 删除背景
- **URL**: `DELETE /backgrounds/{id}`
- **说明**: 删除背景
- **路径参数**: `id` - 背景UUID

### 上传背景缩略图
- **URL**: `POST /backgrounds/{id}/thumbnail`
- **说明**: 为指定背景上传缩略图
- **路径参数**: `id` - 背景UUID
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `Background`

### 导出背景
- **URL**: `POST /backgrounds/export`
- **说明**: 把一张或多张背景打成 ZIP 导出（资源管理 → 背景 → 多选导出）
- **请求体**: 背景 UUID 数组；传空数组或不传表示导出全部背景
```json
["3f0d7a3e-...", "9b1c2d4f-..."]
```
- **响应**: ZIP 文件（`backgrounds.json` + 每张背景的原图与缩略图，各占一个以 UUID 命名的目录）

### 导入背景
- **URL**: `POST /backgrounds/import`
- **说明**: 导入由「导出背景」生成的 ZIP
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `List<Background>` - 导入后的背景列表
- **说明**: UUID 冲突时分配新 UUID，图片以新文件名落盘到 `assets/backgrounds`（缩略图落在
  `assets/backgrounds/thumbnails`），因此不会覆盖已有背景

---

## 6. 音频 (Audios)

### 获取所有音频
- **URL**: `GET /audios`
- **说明**: 获取所有音频资源列表
- **响应**: `List<Audio>`

### 添加音频
- **URL**: `POST /audios`
- **说明**: 添加音频记录
- **请求体**: `Audio` JSON 对象
- **响应**: `Audio`

### 更新音频
- **URL**: `PUT /audios/{id}`
- **说明**: 更新音频信息
- **路径参数**: `id` - 音频UUID
- **请求体**: `Audio` JSON 对象
- **响应**: `Audio`

### 删除音频
- **URL**: `DELETE /audios/{id}`
- **说明**: 删除音频
- **路径参数**: `id` - 音频UUID

### 获取音频文件
- **URL**: `GET /audios/{id}/file`
- **说明**: 获取音频文件流
- **路径参数**: `id` - 音频UUID
- **响应**: 音频二进制数据

### 导出音频
- **URL**: `POST /audios/export`
- **说明**: 把一个或多个音频打成 ZIP 导出（资源管理 → 音效 → 多选导出）
- **请求体**: 音频 UUID 数组；传空数组或不传表示导出全部音频
```json
["audio_1762360609515", "audio_1762360609516"]
```
- **响应**: ZIP 文件（`audios.json` + 每个音频文件，各占一个以 UUID 命名的目录）

### 导入音频
- **URL**: `POST /audios/import`
- **说明**: 导入由「导出音频」生成的 ZIP
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `List<Audio>` - 导入后的音频列表
- **说明**: UUID 冲突时分配新 UUID，音频以新文件名落盘到 `assets/audios`

---

## 7. 角色名片 (Character Cards)

### 获取角色名片图片
- **URL**: `GET /character-card/{characterId}`
- **说明**: 获取角色的名片图片（动态生成，内存/磁盘缓存，参数没变时直接复用）
- **路径参数**: `characterId` - 角色ID
- **响应**: PNG 图片二进制数据（`Cache-Control: no-cache`）

### 用当前参数预览角色名片
- **URL**: `POST /character-card/preview`
- **说明**: 用请求体里的参数**即时渲染**一张名片图片，不读也不写名片缓存。
  供「资源管理 → 角色 → 名片预览」右上角的刷新按钮使用：改完名称/阵营/颜色不必先保存、
  也不必重启应用就能看到新名片。真正的保存仍走 `PUT /characters/{id}`（由它刷新缓存）。
- **请求体**:
```json
{
  "characterID": "char_1762360609515",
  "characterName": "测试角色",
  "faction": "边狱公司",
  "colorBg": "#4C361F",
  "colorText": "#FBDBB3",
  "height": 170
}
```
- **响应**: PNG 图片二进制数据（`Cache-Control: no-store`）
- **错误**:
  - `400` - 请求体为空或 `characterName` 为空
  - `500` - 渲染失败

---

## 8. 异步渲染任务 (Async Jobs)

### 获取任务状态
- **URL**: `GET /admin/async-jobs/status`
- **说明**: 获取异步渲染队列的整体状态
- **响应**:
```json
{
  "queued": 0,
  "inProgress": 0,
  "processedTotal": 0,
  "failedTotal": 0,
  "totalAttempts": 0,
  "failedCounts": {}
}
```

### 获取任务详情
- **URL**: `GET /admin/async-jobs/task/{id}`
- **说明**: 获取指定任务详情
- **路径参数**: `id` - 任务ID
- **响应**: `RenderJob`

### 获取失败任务
- **URL**: `GET /admin/async-jobs/failed`
- **说明**: 获取最近失败的任务列表
- **查询参数**: `limit` (可选, 默认50) - 返回数量
- **响应**: `List<RenderJob>`

---

## 9. 资源包 (Resource Bundle)

资源管理页面顶部的「全部资源导入 / 导出」走这里：一次把角色 + 背景 + 音频打成一个 ZIP，
换机 / 备份时不用分三次导出。后端把三类资源各自按上面单类型包的结构放进三个顶级目录，
因此两类包可以互相兼容（单一类型的资源包也能直接传给「导入全部资源」）。

### 导出全部资源
- **URL**: `POST /resources/export`
- **说明**: 导出角色 + 背景 + 音频
- **请求体**: 无
- **响应**: ZIP 文件（结构见下）

### 导入全部资源
- **URL**: `POST /resources/import`
- **说明**: 导入「导出全部资源」生成的 ZIP；也接受角色 / 背景 / 音频的单一类型资源包
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: 各类型实际导入的数量
```json
{
  "characters": 2,
  "backgrounds": 5,
  "audios": 3
}
```
- **说明**:
  - 包内格式版本高于当前程序支持的版本时返回 `400`，提示先升级程序
  - 所有资源都按"新增"处理：ID 冲突时分配新 ID，不会覆盖本机已有资源
  - 单个文件上限 4GB（`spring.servlet.multipart.max-file-size`），足够装下整库素材

### 资源包结构
```
resources_<时间戳>.zip
├─ manifest.json          格式版本（formatVersion）+ 导出时间 + 应用名
├─ characters/
│  ├─ characters.json     角色元数据
│  └─ <角色目录>/         立绘原图与 thumbnails/ 缩略图
├─ backgrounds/
│  ├─ backgrounds.json    背景元数据
│  └─ <背景UUID>/         原图与 thumbnails/ 缩略图
└─ audios/
   ├─ audios.json         音频元数据
   └─ <音频UUID>/         音频文件
```

---

## 通用响应格式

### 成功响应
直接返回对应类型的数据对象或列表。

### 错误响应
当发生错误时，后端可能返回：
- HTTP 404: 资源不存在
- HTTP 500: 服务器内部错误，返回错误信息字符串

---

## CORS 配置

后端已配置 CORS，允许以下来源访问：
- `http://localhost:3000`
- `http://127.0.0.1:3000`

---

*文档版本: 2026-06-05*
*维护者: qbbb718*
