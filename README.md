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
- 预览 / 属性 / 剧情记录是三块**可拖动面板**：拖页签到别的面板上/下/左/右可按方向分割停靠，
  拖到中间合并成页签，拖到停靠区外松手变成可移动、可缩放的独立窗口；布局自动记忆
- 下半部分显示剧情记录列表，支持插入、删除、调整顺序或复制记录
- 左上部分显示当前记录的预览图和进度条
- 右上部分为属性编辑区，包含文本、立绘、背景、特效和音效等标签页
- 全局设置页面可设置项目参数，如音量、剧情类型等

### 情绪动画（序列帧）
给一张立绘挂一段"贴脸"的帧序列动画（花开、怒气符号、汗滴…）。

**制作**在「资源管理 → 序列帧动画」：

1. 点「新建（选图片）」多选一批 PNG/JPG，或「从文件夹」直接选整个目录，或「导入 .lcaf」
   - 一次要进来好几套？点「批量导入 .lcaf」多选文件，逐个导入并显示进度；某套坏了只报错、不影响其它
   - 顺序自动按**文件名自然排序**（`frame_9` 在 `frame_10` 前面）
   - 各帧尺寸不一致时会自动居中贴到公共画布并提示
   - **按文件名编号自动推算时长**（默认开启，可在左侧关掉）：文件名带规律编号时，
     每张图的持续帧数按"相邻编号差值"自动填好。例：`xxx_1/2/3/7/9.png` → `1 / 1 / 4 / 2 / 默认1` 帧
     - 命名没有规律、没有编号、只有一张时**不推算也不报错**，导入照常完成（每张 1 帧）
     - 重复编号、前缀不一致、编号逆序会给出提示；间隔超过 60 帧会被截断
     - 推算结果直接显示在时长框里，随时可以逐张手改
2. 右侧改每张图的**持续帧数**（或用「全部设为 N 帧」批量设）、播放模式、淡入淡出、不透明度
3. 挑**缩略图**：点「帧序列」里的「选择缩略图」，再点某一帧即可（当前缩略图带角标与金边框），
   按 `Esc` 或再点一次按钮退出选择状态；缩略图相对头部的**摆放参数**也在同一个区块里。
   左侧列表里每套动画的**封面就是这张缩略图**（不是第 0 张）
4. 在合成预览里**拖动缩略图**摆位置、**滚轮**调大小：
   底板是后端按成片同一套管线渲的（背景 + 立绘 + UI），缩略图盖在最上面，所见即所得；
   预览图固定 16:9，窗口怎么缩放都只等比缩放、居中留白，不会变形
   - 缩放以缩略图**自身中心**为基准；位置存成**相对头部区域**的偏移（单位 = 头宽），
     所以换角色也能复用（头部方框任何角色都是同样大小）
5. 点「▶ 播放」按真实节奏预览：**播放 / 停止是同一个按钮**（播放中变成「⏹ 停止」，点了回到初始状态），
   另有「⏸ 暂停」+「循环播放」；淡入、淡出是两个**独立参数**，改完立刻能在播放里验效果。
   播到末尾：勾了「循环播放」从头再播，不勾就自动停下并回到缩略图
   - 播放中会锁定缩略图的拖拽/缩放（每帧都在换图，边播边拖会打架）；暂停或停止后恢复可编辑
6. 「导出 .lcaf」得到单个文件（本质是 zip：`clip.json` + `frames/*.png`），
   发给别人后「导入 .lcaf」即可还原，每帧时长与缩略图摆放原样保留
   - 要一次导出好几套：点「选择导出」进入多选态，勾选（或「全选」）后「确认导出 (N)」，
     只弹一次目录选择框，每套各写成一个 `.lcaf`（同名自动加 `_2`）

**使用**在「剧情编辑 → 立绘 → 情绪动画」：只能**选**一段已有的动画（下拉框里每一项都带缩略图，
一眼能分清是哪段；或用「前往资源管理编辑动画 →」跳过去做）；
立绘 tab 里不再有制作入口。预览图里会画出**缩略图**，拖动/缩放/切换立绘时它按"相对头部"的关系实时跟随。

> 情绪动画**不会改变记录时长**：素材再长也只播到记录结束为止。

### 资源管理界面
- 角色管理：编辑角色信息、立绘列表和属性
- 背景管理：管理背景图片和标签
- 音效管理：管理音频资源和分类
- 序列帧动画：制作 / 配置情绪动画，支持 `.lcaf` 单套与**批量**导入导出（见上一节）
- 页面顶部的「导出 / 导入全部资源」一次打包 **角色 + 背景 + 音频 + 序列帧动画**，换机 / 备份用
- 支持搜索、筛选功能，窗口拉窄时控件自动换行 / 滚动，不会被裁掉

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

## 版本号管理

当前版本：**0.2.3**（真源：`demo/frontend/electron-react-app/package.json` 的 `version`）

```powershell
node scripts\version.mjs                 # 查看各处版本号是否一致
node scripts\version.mjs 0.2.4 --write   # 一次性同步 package.json / pom.xml / application.yml / package-lock.json
node scripts\version.mjs --check         # 校验一致性（CI 用）
node scripts\version.mjs --check-tag v0.2.4   # 额外校验 git tag（发版前/CI 用）
```

- 安装包文件名（`LCP<版本号>.exe`，由 `electron-builder.yml` 的 `nsis.artifactName` 决定）、"关于"弹窗、设置页「关于 → 版本」、自动更新源（`latest.yml`）都来自 `package.json`（经 `app.getVersion()`）
- 后端 jar 版本来自 `demo/pom.xml` 的 `<project><version>`（`demo-0.<版本>-SNAPSHOT.jar`）
- 后端日志「后端版本: x.y.z」与 `GET /api/health` 的 `version` 来自 `demo/src/main/resources/application.yml` 的 `app.version`
- 前端日志（`logs\log-*.log`）启动时会打印 `应用版本: x.y.z | 运行模式: ...`，排障先看这一行
- 改完记得在 [版本更新笔记](docs/版本更新笔记.md) 顶部加一节，提交后打 tag（`git tag v0.2.4`）触发 CI 发版
- 详细说明与坑：[本地打包说明](docs/本地打包说明.md) 的「改版本号」

## 排障：立绘显示成红色「加载失败」方块

WebP 立绘在 Java 21 上没有 ImageIO 解码器，只能靠 JavaCV/FFmpeg 的原生库解码；
原生库起不来时渲染管线拿不到像素，就会画出红色占位图。最快的判断方式是直接在**打包好的 jar** 上自检：

```powershell
java -jar demo\target\demo-0.2.3-SNAPSHOT.jar --self-check=webp
```

`[SELF-CHECK] PASS webp 8x4 ...` 并返回 0 = 解码链路正常；返回 1 时日志里会有完整的原因链。

注意这类问题**本地开发环境复现不了**：`mvn spring-boot:run` / IDE / `mvn test` 用的是扁平 classpath，
原生 jar 是磁盘上的真实文件；只有 `java -jar`（Spring Boot 可执行 jar）才会暴露。
详见 [本地打包说明](docs/本地打包说明.md) 的「先跑一次后端自检」。

另外，立绘上传时如果文件是 WebP 会自动转成 PNG 存盘、原图备份到角色目录下的 `originals/`，
所以**新上传的立绘不会再因为原生库问题变红**（上传时解不出来会直接报错、不落库）；
老素材里的 `.webp` 仍由 FFmpeg 兜底读取。详见 [本地打包说明](docs/本地打包说明.md) 的「立绘的 WebP → PNG 入库转换」。

## 文档

- [项目文档](docs/项目文档.md) - 模块结构与总体设计
- [代码导航指南](docs/代码导航指南.md) - 按功能/问题定位代码
- [前端架构文档](docs/前端架构文档.md) - 组件层级与数据流
- [前端模型](docs/前端模型.md) - 前后端数据模型字段
- [API文档](docs/API文档.md) - REST 接口说明
- [配置文档](docs/配置文档.md) - 后端与前端配置项
- [本地打包说明](docs/本地打包说明.md) - 出安装包的完整流程与坑
- [版本更新笔记](docs/版本更新笔记.md) - 各版本改动
- [情绪动画设计](docs/情绪动画设计.md) - 立绘的序列帧动画（**已实现**，开头有「实现说明」记录与设计稿的差异）
- [立绘动画设计](docs/立绘动画设计.md) - 立绘移动动画（预设 / 关键帧）的实现规格与进度

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
- DSH老师几乎写了所有代码
- 感谢陪我测试软件的网友们：户用様，黄土様，南平苍様

