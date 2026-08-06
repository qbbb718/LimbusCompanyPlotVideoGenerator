# 缩略图与角色名片图片路径重构计划

## Context（背景与目标）

当前角色相关图片的存储存在三个问题：

1. **路径定义分散**：立绘缩略图的保存路径硬编码在 Electron 主进程 `public/electron.js`（`./assets/thumbnails/`）；角色名片图片的缓存路径硬编码在 `CharacterCardImageCache.java` 的 `static final CACHE_DIR`（`assets/images/thumbnails/character_cards/`）。这些路径既不在后端 config 中，也无法通过 `application.yml` 自定义。

2. **静态字段初始化 bug**：`CharacterCardImageCache.CACHE_DIR` 是 `static final`，在类加载时初始化，此时 `ProjectConfig` 的 `@PostConstruct init()` 还未执行，导致 `THUMBNAIL_BASE_PATH` 是默认值，配置项失效。

3. **删除不联动**：缩略图和名片图片散落在角色目录之外，删除角色（勾选"删除相关文件"）时无法随角色目录一并清理，需要额外逻辑单独删除，容易遗漏（实际已观察到残留问题）。

**目标**：
- 把名片图片和立绘缩略图都存到 `assets/characters/{角色拼音}/thumbnails/` 下
- 路径定义集中到 `demo/src/main/java/com/lbc_plot/config` 下的配置类，可通过 `application.yml` 自定义
- 删除角色目录时，缩略图和名片图片随目录一并删除（需求 4 自动满足）
- 删除角色对话框的"删除相关文件"默认勾选（需求 1）

## 现状链路（已确认）

### 角色名片图片
- **生成**：`CharacterController.addCharacter`/`updateCharacter` → `CharacterCardImageCache.getCharacterCardImage(character)`
- **磁盘缓存**：`CharacterCardImageCache.saveToCache` → `assets/images/thumbnails/character_cards/{characterId}.png`（静态 `CACHE_DIR`，配置失效）
- **访问**：`/api/character-card/{characterId}` → `CharacterCardController` 动态生成返回字节流（磁盘缓存仅加速，缺失会重新生成）
- **DB 字段**：`character_card_image_path` = `/api/character-card/{id}`（URL，前端用此 URL 访问）
- **WebMvcConfig**：`/api/character-card/**` 静态映射到 `character_cards/` 目录（**冗余**，Controller 已处理）
- **删除**：`deleteCharacter` 未显式删除名片缓存（依赖 `clearCache` 在更新时调用）

### 立绘缩略图
- **生成**：前端 `PortraitModal.tsx:209` 用 `createCroppedImage` 裁剪生成 blob
- **文件名**：`thumbnail_{portraitID}.png`（`PortraitModal.tsx:215`）
- **保存**：`public/electron.js:396` `saveThumbnail` IPC → `demo/assets/thumbnails/{fileName}`（硬编码）
- **返回路径**：`/assets/thumbnails/{fileName}`（URL 路径，存入 DB `thumbnail_path`）
- **前端访问**：`PortraitThumbnail.tsx:37-40` `startsWith("/")` → 拼 baseUrl → `/assets/**` 静态映射访问 ✓
- **后端加载 BufferedImage**：`Portrait.getThumbnail()` `new File("/assets/...")` 在 Windows 下相对于盘符根目录，找不到（有 try-catch 容错）

### 删除角色流程（已修复，本次扩展）
- `CharacterController.deleteCharacter`：先查立绘 → 删除角色目录（递归） → 删 DB

## 实现方案

### 1. 前端默认勾选（需求 1）

**文件**：`demo/frontend/electron-react-app/src/features/common/components/ResourceManager/tabs/CharacterDetailModal.tsx`

- 第 44 行：`const [deleteFiles, setDeleteFiles] = useState(false);` → `useState(true)`

### 2. 配置层（需求 2、3 的"路径定义放到 config"）

**文件**：`demo/src/main/java/com/lbc_plot/config/AppConfig.java`

在 `Assets` 内部类新增字段：
```java
/** 角色目录下存放缩略图与名片图片的子目录名（可配置） */
private String characterThumbnailsSubdir = "thumbnails";
// + getter/setter
```

**文件**：`demo/src/main/resources/application.yml`

```yaml
app:
  assets:
    path: ./assets
    audios: ${app.assets.path}/audios
    backgrounds: ${app.assets.path}/backgrounds
    characters: ${app.assets.path}/characters
    thumbnails: ${app.assets.path}/thumbnails   # 保留，向后兼容（旧文件清理用）
    characterThumbnailsSubdir: thumbnails        # 新增：角色目录下的缩略图子目录名
```

### 3. 名片图片路径重构（需求 2）

#### 3.1 `CharacterCardImageCache.java` 重构为实例 Bean

**文件**：`demo/src/main/java/com/lbc_plot/resource/character/CharacterCardImageCache.java`

- 移除 `private static final String CACHE_DIR`（修复静态初始化 bug）
- 改为 `@Component` 实例 Bean，注入 `CharacterFolderService`、`AppConfig`、`Jdbi`
- 所有方法从 `static` 改为实例方法
- 新增 `getCacheFile(String characterId)` 动态计算路径：
  ```java
  private File getCacheFile(String characterId) {
      String folderName = resolveFolderName(characterId);  // 从 DB 查 folder_name，fallback 用 characterId
      File dir = new File(
          new File(appConfig.getAssets().getCharacters(), folderName),
          appConfig.getAssets().getCharacterThumbnailsSubdir()
      );
      if (!dir.exists()) dir.mkdirs();
      return new File(dir, characterId + ".png");
  }
  ```
- `getCharacterCardImage`、`saveToCache`、`clearCache`、`clearAllCache`、`getCharacterCardImagePath` 全部改实例方法
- `imageCache`（内存缓存）可保留为 `static final ConcurrentHashMap`（与磁盘缓存解耦）

#### 3.2 `CharacterCardController.java` 注入实例

**文件**：`demo/src/main/java/com/lbc_plot/resource/character/CharacterCardController.java`

- 第 63 行：`CharacterCardImageCache.getCharacterCardImage(character)` 静态调用 → 注入 `CharacterCardImageCache` 实例，改 `characterCardImageCache.getCharacterCardImage(character)`

#### 3.3 `CharacterController.java` 注入实例

**文件**：`demo/src/main/java/com/lbc_plot/resource/controller/CharacterController.java`

- 新增 `@Autowired private CharacterCardImageCache characterCardImageCache;`
- 第 144、359、386、242 行的 `CharacterCardImageCache.xxx` 静态调用 → 改实例调用

#### 3.4 `WebMvcConfig.java` 删除冗余映射

**文件**：`demo/src/main/java/com/lbc_plot/config/WebMvcConfig.java`

- 删除第 52-55 行 `/api/character-card/**` 静态映射（`CharacterCardController` 已动态处理，映射冗余且新路径不在该目录）

### 4. 缩略图改为后端 API 上传（需求 3，用户决策①）

#### 4.1 后端新增上传接口

**文件**：`demo/src/main/java/com/lbc_plot/resource/controller/PortraitController.java`

新增接口：
```java
@PostMapping("/characters/{characterId}/portraits/{portraitId}/thumbnail")
public String uploadPortraitThumbnail(
        @PathVariable String characterId,
        @PathVariable String portraitId,
        @RequestParam("file") MultipartFile file) {
    // 1. 查角色 → 拿 characterName
    // 2. resolveOrCreateFolder 拿拼音目录
    // 3. 构造目录: {characters}/{拼音}/{characterThumbnailsSubdir}/
    // 4. 文件名: thumbnail_{portraitId}.png
    // 5. 保存
    // 6. 返回 URL 路径: /assets/characters/{拼音}/{subdir}/thumbnail_{portraitId}.png
}
```
保存逻辑委托给 `StorageService` 新方法 `uploadPortraitThumbnail(file, characterId, portraitId)`，返回 URL 路径。

**文件**：`demo/src/main/java/com/lbc_plot/resource/service/StorageService.java`

新增方法：
```java
public String uploadPortraitThumbnail(MultipartFile file, String characterId, String portraitId) {
    validateFile(file);
    MyCharacter character = jdbi.withExtension(CharacterDAO.class, dao -> dao.findById(characterId).orElse(null));
    if (character == null) throw new IllegalArgumentException("角色不存在: " + characterId);
    String folderName = characterFolderService.resolveOrCreateFolder(characterId, character.getCharacterName());
    File subdir = new File(
        new File(appConfig.getAssets().getCharacters(), folderName),
        appConfig.getAssets().getCharacterThumbnailsSubdir()
    );
    if (!subdir.exists()) subdir.mkdirs();
    String filename = "thumbnail_" + portraitId + ".png";
    File dest = new File(subdir, filename);
    Files.copy(file.getInputStream(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
    return "/assets/characters/" + folderName + "/" + appConfig.getAssets().getCharacterThumbnailsSubdir() + "/" + filename;
}
```
注入 `AppConfig`（已有 `StorageConfig`，需补 `AppConfig`）。

#### 4.2 前端改为调用后端接口

**文件**：`demo/frontend/electron-react-app/src/features/common/components/ResourceManager/tabs/PortraitModal.tsx`

第 217-235 行（`if (window.electronAPI) {...} else {...}`）替换为：
```ts
const formData = new FormData();
formData.append("file", thumbnailBlob, `thumbnail_${editingPortrait.portraitID}.png`);
const thumbnailPath = await ApiService.uploadPortraitThumbnail(
  editingPortrait.characterID,
  editingPortrait.portraitID,
  formData
);
editingPortrait.thumbnailPath = thumbnailPath;
```
移除对 `window.electronAPI.saveThumbnail` 的依赖。

**文件**：`demo/frontend/electron-react-app/src/features/common/ApiService.ts`

新增方法：
```ts
async uploadPortraitThumbnail(characterId: string, portraitId: string, formData: FormData): Promise<string> {
  const response = await apiClient.post(
    `/characters/${characterId}/portraits/${portraitId}/thumbnail`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;  // 返回 URL 路径字符串
}
```

#### 4.3 `Portrait.getThumbnail()` 修复加载逻辑

**文件**：`demo/src/main/java/com/lbc_plot/resource/model/Portrait.java`

第 210-235 行 `getThumbnail()` 方法：当前 `new File(thumbnailPath)` 对 `/assets/...` URL 路径找不到文件。改为：
```java
public BufferedImage getThumbnail() {
    if (this.thumbnail == null && this.thumbnailPath != null && !this.thumbnailPath.trim().isEmpty()) {
        try {
            // thumbnailPath 形如 "/assets/characters/{拼音}/thumbnails/xxx.png"
            // 去掉前导 /，相对于 JVM 工作目录（demo/）解析
            String fsPath = this.thumbnailPath.startsWith("/") ? this.thumbnailPath.substring(1) : this.thumbnailPath;
            java.io.File f = new java.io.File(fsPath);
            if (f.exists() && f.isFile()) {
                this.thumbnail = javax.imageio.ImageIO.read(f);
            } else {
                // 回退：用 ImageReader 按资源路径查找
                this.thumbnail = ImageReader.readCharacters(this.thumbnailPath);
            }
            if (this.thumbnail == null) this.thumbnail = createDefaultImage();
        } catch (Exception e) {
            logger.error("加载图像失败: {}", thumbnailPath, e);
            this.thumbnail = createDefaultImage();
        }
    }
    return this.thumbnail;
}
```
### 6. 删除联动验证（需求 4）

路径重构后，缩略图和名片图片都在 `assets/characters/{拼音}/thumbnails/` 下。`CharacterFolderService.deleteFolder` 递归删除角色目录时自动包含。

**文件**：`demo/src/main/java/com/lbc_plot/resource/controller/CharacterController.java`

第 435-444 行的"单独删除缩略图"逻辑保留作为兜底（兼容旧路径残留），但在 `deleteFiles=true` 时新增调用 `characterCardImageCache.clearCache(id)` 清理名片内存缓存。

## 修改文件清单

### 后端
| 文件 | 修改 |
|------|------|
| `config/AppConfig.java` | 新增 `characterThumbnailsSubdir` 字段 |
| `config/WebMvcConfig.java` | 删除 `/api/character-card/**` 冗余映射 |
| `resources/application.yml` | 新增 `characterThumbnailsSubdir` 配置项 |
| `resource/character/CharacterCardImageCache.java` | 重构为实例 Bean，动态路径 |
| `resource/character/CharacterCardController.java` | 注入实例，改实例调用 |
| `resource/controller/CharacterController.java` | 注入实例，改实例调用，删除时清理名片缓存 |
| `resource/controller/PortraitController.java` | 新增缩略图上传接口 |
| `resource/service/StorageService.java` | 新增 `uploadPortraitThumbnail` 方法，注入 AppConfig |
| `resource/model/Portrait.java` | 修复 `getThumbnail()` 路径解析 |

### 前端
| 文件 | 修改 |
|------|------|
| `tabs/CharacterDetailModal.tsx` | 第 44 行默认勾选 `true` |
| `tabs/PortraitModal.tsx` | 改为调用后端 API 上传缩略图 |
| `common/ApiService.ts` | 新增 `uploadPortraitThumbnail` 方法 |

## 验证方法（端到端）

### 启动验证
1. `cd demo && mvn spring-boot:run` 启动后端
2. 检查 `assets/characters/{拼音}/thumbnails/` 下应有 `thumbnail_*.png` 和 `{characterId}.png`

### 功能验证
1. 启动前端 `cd frontend/electron-react-app && npm run electron`
2. **删除默认勾选**：打开角色详情 → 删除 → 确认"同时删除相关文件"默认勾选 ✓
3. **新建角色**：创建角色 → 检查 `assets/characters/{新拼音}/thumbnails/{characterId}.png` 名片图片生成 ✓
4. **上传立绘+缩略图**：进入立绘编辑 → 裁剪 → 保存 → 检查：
   - 缩略图保存到 `assets/characters/{拼音}/thumbnails/thumbnail_{portraitId}.png` ✓
   - 前端立绘列表缩略图正常显示 ✓
   - 名片图片 `/api/character-card/{id}` 正常返回 ✓
5. **删除角色（勾选删除文件）**：删除 → 检查：
   - `assets/characters/{拼音}/` 整个目录被删除（含 thumbnails 子目录）✓
   - DB 角色记录删除 ✓
   - 无残留文件 ✓

### 回归验证
- `Portrait.getThumbnail()` 后端加载 BufferedImage 不再报错
- 编译通过：`mvn clean compile`

## Review v2 补充（自我审查发现）

执行时需注意以下细节，避免踩坑：

### A. 前端上传时序
`PortraitModal.tsx` 当前流程：上传立绘原图 → 裁剪生成 blob → 保存立绘。新流程改为：上传立绘原图 → 裁剪生成 blob → **调后端接口上传缩略图拿 path** → 把 path 设入 `editingPortrait.thumbnailPath` → 保存立绘（带 thumbnailPath 一起 PUT/POST）。
- `portraitId` 由前端生成（`portrait_{Date.now()}`，见 `usePortraitState.ts:60`），后端 `addPortrait` 不会覆盖非空 ID（见 `PortraitController.java:76-79`），故缩略图上传时使用的 portraitId 与最终入库一致 ✓
- 缩略图上传接口需在立绘保存之前调用，portraitId 已就绪

### B. CharacterCardImageCache.getCacheFile 的目录保障
用 `characterFolderService.resolveOrCreateFolder(characterId, characterName)` 而非直接查 `getFolderName`，确保极端情况下（folder_name 丢失）也能创建并写入目录。需要先查角色名（注入 `Jdbi` + `CharacterDAO.findById`）。

### C. 不修改的死代码与背景缩略图
- `DiskThumbnailCache.java` / `ThumbnailServiceImpl.java`：经搜索确认无业务调用方（仅自身内部调用），属死代码。本次**不修改**，避免引入风险。若未来启用，需另行重构。
- `BackgroundController` 的背景缩略图仍存到 `./assets/thumbnails/`（`StorageConfig.thumbnailsDir`），属背景资源，不在本次需求范围，保留旧路径。



### E. CharacterCardImageCache.imageCache 内存缓存
保留为 `static final ConcurrentHashMap<String, BufferedImage>`（与磁盘路径解耦，按 characterId 索引），不改为实例字段。`clearCache` 同步清理内存 + 磁盘。

### F. WebMvcConfig 删除冗余映射的安全性
确认 `CharacterCardController` 的 `@GetMapping("/character-card/{characterId}")` 优先级高于静态资源映射（Spring MVC Controller 优先于 ResourceHandler），删除 `/api/character-card/**` 静态映射后，`/api/character-card/{id}` 仍由 Controller 处理，无 404 风险。
