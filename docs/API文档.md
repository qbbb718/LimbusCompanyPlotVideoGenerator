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
  - [4. 立绘 (Portraits)](#4-立绘-portraits)
    - [添加立绘](#添加立绘)
    - [更新立绘](#更新立绘)
    - [删除立绘](#删除立绘)
    - [设置默认立绘](#设置默认立绘)
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
  - [6. 音频 (Audios)](#6-音频-audios)
    - [获取所有音频](#获取所有音频)
    - [添加音频](#添加音频)
    - [更新音频](#更新音频)
    - [删除音频](#删除音频)
    - [获取音频文件](#获取音频文件)
  - [7. 角色名片 (Character Cards)](#7-角色名片-character-cards)
    - [获取角色名片图片](#获取角色名片图片)
  - [8. 异步渲染任务 (Async Jobs)](#8-异步渲染任务-async-jobs)
    - [获取任务状态](#获取任务状态)
    - [获取任务详情](#获取任务详情)
    - [获取失败任务](#获取失败任务)
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

### 生成视频
- **URL**: `POST /generate-video`
- **说明**: 根据记录列表生成视频
- **请求体**:
```json
{
  "records": [...]
}
```
- **响应**: `String` - 生成结果或任务ID

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
- **说明**: 将指定立绘设为角色的默认立绘
- **路径参数**:
  - `characterId` - 角色ID
  - `portraitId` - 立绘ID

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

---

## 7. 角色名片 (Character Cards)

### 获取角色名片图片
- **URL**: `GET /character-card/{characterId}`
- **说明**: 获取角色的名片图片（动态生成）
- **路径参数**: `characterId` - 角色ID
- **响应**: PNG 图片二进制数据

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
