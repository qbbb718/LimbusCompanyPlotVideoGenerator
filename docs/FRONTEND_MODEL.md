# 前端模型（类与实例参数汇总）

此文档按类列出项目中重要的“实例类”（model / video / storage 等），包含字段（实例参数）、类型、可见性及简短说明，便于把模型映射到前端数据结构或 API。

---

## 约定
- + public, - private, # protected
- 类型使用 Java 原始类型或引用类型名称
- 标注了 `@JsonIgnore` 或 `transient` 的字段通常不序列化到前端，可选映射

---

## Record
描述：剧情记录，包含对白、摄像机、背景、角色、特效与音频等。

- - uuid : String — 唯一 id（Jackson 反序列化需要，可由 Builder 或构造器生成）
- - durationFrames : int — 持续帧数（计算值）
- - dialogue : Dialogue — 对白/文字内容对象
- - camera : Camera (@JsonIgnore) — 摄像机信息（后端/渲染使用，可忽略）
- - bg : List<BackgroundVisual> — 背景视觉元素列表
- - chars : List<CharacterVisual> — 角色视觉元素列表
- - effects : List<EffectVisual> (@JsonIgnore) — 特效列表（运行时）
- - audioCommands : List<AudioCommand> — 音频命令/片段列表
- - isDirty : boolean — 是否在上次导出后修改过
- - preImage : BufferedImage (@JsonIgnore) — 预览图（缓存，不序列化）

构造器/Builder：支持全参构造与 `Record.Builder`（Jackson 友好）。Builder 字段与上面属性对应。

重要方法：addBackgroundVisual/addCharacterVisual/addEffectVisual/addAudioCommand、markClean

---

## Dialogue
描述：一条对白文本，包含说话人、位置、对齐、速度、情绪等。

- - text : String — 文字内容
- - location : String — 场景地点/位置
- - speakerC : List<CharacterRef> — 说话人引用列表
- - speakerName : String — 说话人名字（字符串）
- - faction : String — 阵营
- - align : Dialogue.Align — 对齐方式（LEFT, CENTER）
- - speed : int — 文本显示速度调节
- - emotion : Dialogue.Emotion — 情绪枚举

构造器/Builder：`Dialogue.Builder`，默认值：text="...", location="default", align=LEFT, emotion=NORMAL。含 NLP 简单情绪分析方法 `emotionNLP()`。

注意：旁白逻辑（默认说话人为“旁白”）会强制某些约束（例如居中、单人说话）。

---

## VisualElement (抽象类)
描述：视觉元素基类，子类有 BackgroundVisual、CharacterVisual、EffectVisual 等。具体字段在子类定义。

---

## BackgroundVisual
描述：封装背景资源与显示属性。

- - background : Background — 背景资源引用（序列化）
- - bgImage : BufferedImage (@JsonIgnore) — 缓存的图像，不序列化
- - posX : int — 显示位置 X
- - posY : int — 显示位置 Y
- - scale : float — 缩放，默认 1.0
- - visible : boolean — 是否可见，默认 true

构造器/方法：多种构造器（仅 Background、带位置、带位置与缩放、无参）。方法有 reloadImage(), hasValidImage(), getScaledWidth/Height(), copy()

前端映射建议：传递 background 的 id/path 与 posX/posY/scale/visible 即可，图片可以单独按需请求。

---

## CharacterVisual
描述：角色立绘的可视化表示（包含角色引用、立绘、位置、偏移、是否压暗等）。

- - chara : CharacterRef — 角色引用（序列化）
- - portrait : Portrait — 立绘信息（序列化）
- - charaCache : MyCharacter (@JsonIgnore transient) — 运行时缓存
- - image : BufferedImage (@JsonIgnore) — 运行时图像缓存
- - posX : int — 计算后坐标 X
- - posY : int — 计算后坐标 Y
- - adjX : int — 用户手动调整 X 偏移
- - adjY : int — 用户手动调整 Y 偏移
- - dim : boolean — 是否压暗（默认 true）
- - color_Name_Image : BufferedImage (@JsonIgnore) — 人设界面预览图

构造器/Builder：通过 `CharacterVisual.Builder` 构建，Builder 支持必需参数（Character / Portrait）和可选 pos/adj/dim/image 等。

前端映射建议：发送 chara（id/name）、portrait（id/imagePath/faceX/adjX/adjY 等）、pos/adj/dim。图片可按需请求。

---

## EffectVisual
描述：特效可视化类，当前为空实现（子类可扩展）。

字段：无特定字段（继承自 VisualElement）。

---

## CharacterRef
描述：角色轻量引用数据（用于剧情、渲染时传递最小信息）。

- - characterID : String — 角色 id
- - characterName : String — 角色名称
- - height : int — 角色身高（用于定位）
- - faction : String — 阵营
- - colorBg : Color — 背景色（序列化使用 ColorSerializer）
- - colorText : Color — 文字色（序列化使用 ColorSerializer）
- - colorNameImage : BufferedImage (@JsonIgnore) — 运行时生成的预览，不序列化

静态方法/工厂：from(MyCharacter) 将完整角色转换为 CharacterRef；提供 getDefaultNarrator()。

前端映射建议：传递 id/name/height/faction/color（颜色可转为 hex 或 RGB 对象）。

---

## Background (storage)
描述：持久化背景资源。

- - uuid : String — 背景唯一 id
- - path : String — 文件路径或资源路径
- - name : String — 显示名（场景地点名称）
- - image : BufferedImage (@JsonIgnore) — 懒加载的图像缓存

方法：getImage() 为懒加载；getWidth()/getHeight()；reloadImage()/releaseImage()

前端映射建议：在前端只需要 uuid/path/name；图片由资源接口单独提供。

---

## MyCharacter (storage)
描述：完整的角色实体（持久化），包含多个 Portrait 与配色信息。

- - characterID : String
- - characterName : String
- - height : int
- - faction : String
- - portraits : List<Portrait>
- - colorBg : Color
- - colorText : Color
- - colorNameImage : BufferedImage (@JsonIgnore)

构建方式：使用 `MyCharacter.Builder`，支持默认值与智能补全（默认旁白实例）。

前端映射建议：前端通常只需 characterID / characterName / default portrait id / color 信息 / height。

---

## Portrait
描述：立绘（差分）数据，包含 imagePath、面部位置、情绪等。

- - portraitID : String
- - characterID : String — 所属角色 id
- - imagePath : String — 图片路径（资源或文件）
- - image : BufferedImage (@JsonIgnore) — 懒加载缓存
- - portName : String — 立绘名
- - emotion : Emotion — 枚举
- - faceX, faceY : int — 面部参考坐标
- - length : int — 头部长度（像素）
- - adjX, adjY : int — 立绘微调偏移
- - thumbnailPath : String — 缩略图路径
- - thumbnail : BufferedImage (@JsonIgnore)

Builder：`Portrait.Builder` 支持 imagePath 必需参数与其他可选字段。

前端映射建议：前端应直接使用 portraitID/imagePath/portName/emotion/faceX/faceY/adj，以渲染或计算定位。图片按需请求。

---

## 其它值得关注的 model 包（简要）
- `com.lbc_plot.render.audio.model.AudioCommand` / `AudioTimeline` / `AudioSegment`：音频时间线对象，前端可需暴露音频片段时间/类型/路径。
- `com.lbc_plot.render.engine.model.TextLayerInfo` 等：与渲染层相关的小数据结构，按需映射。

---

## 建议（前端数据设计）
1. 只序列化 "轻量化" 字段给前端：id / path / numeric positions / booleans / color (hex) / 枚举值。后台的 BufferedImage、transient、@JsonIgnore 字段不应直接暴露。
2. 图片资源单独通过静态资源或接口提供（返回 URL），前端按需加载，避免把二进制数据内联到主模型。
3. 为常用集合（例如 Record.chars, Record.bg）提供分页或按需展开的 API，以减少一次性 payload。
4. 在前端建模时，把 Builder 可配置项映射为可编辑表单字段（例如 CharacterVisual 的 adjX/adjY/pos/ dim 等）。

---


## 界面计划

### 1. 剧情编辑界面
窗口下半部分, 为records的列表, 一个record一行, 每行显示record的属性, 如text, speaker, emotion, align等,  也可以插入, 删除,调整顺序 或复制record。像是一个 首行冻结的execl表格
上半部分分为左右两半. 
左半显示当前选择record的预览图, 下方有一个可拖动像视频进度条的, 可以用来快速跳转record. 
右半为record的属性编辑区. 属性又细分为几个子标签页面(上面有标签, 可以点击切换, 保证空间足够大用户使用感好), 如, 文本, 立绘, 背景, 特效, 音效等. 每个标签窗口内, 都有一个可编辑的表单, 可以编辑当前record的对应属性. 有个特殊的整体页面, 设置一些该项目的全局参数, 例如音效BGM语音的整体音量, 剧情类型是剧情还是人格故事等.

### 2. 资源管理界面
几个子标签页面(上面有标签, 可以点击切换)
角色，背景, 音效等. 
背景, 音效较为简单, 记录文件路径与名称, 在加上可以设置tag, 按照tag筛选, 可以拖动排序, 可以删除, 可以添加新的资源, 可以按照名称/文件名/tag搜索筛选.
角色管理页面, 列出所以角色(角色名, 角色头像), 选中角色后可以编辑该角色具体属性, 例如姓名,身高,名片文字颜色与背景颜色等, 以及展示角色的立绘列表(立绘名优先显示用户设置的名称, 若没有设置则显示设置情绪, 若还没有情绪则显示文件名. 显示裁剪后的头像).可以选择文件添加立绘, 在单个立绘添加后需要设置立绘的属性, 如情绪, 裁剪位置, 裁剪尺寸, 立绘名等. 文字提醒用户裁剪位置与尺寸涉及立绘显示位置与比例的计算, 在载入时先读取默认立绘设置的裁剪参数, 若用户没有修改, 则默认使用默认值, 若用户修改了, 则使用用户设置的值.
以及设置按钮快速打开resource文件夹, 因为后端都是从对于的resource文件夹中读取文件. 例如角色立绘会从\demo\src\main\resources\assets\characters中去读, 背景会从\demo\src\main\resources\assets\backgrounds中去读, 音效会从\demo\src\main\resources\assets\audio中去读.


### 3. 设置界面
设置界面, 保存设置, 保存路径, 主题等.

### 4. 文本转records
一个输入框, 用户可以输入文字, 粘贴文字, 或将文件拖入来加载文字.
输入框默认内容是格式提示文本

[BGM名称]
{背景图片名称}
说话人: 对话内容(情绪)
旁白: 对话内容

BGM名称与图片名称会使用搜索匹配BGM库中的名称/文件名
情绪用于设置立绘
当设置新BGM时, 之前的BGM会自动停止
[-STOP]可以停止当前BGM

然后用户点击一个按钮, 调用后端的工具将纯文本转为records, 然后显示在剧情编辑界面中.




## 启动
cd e:/LimbusCompanyPlotVideoGenerator/demo
mvn spring-boot:run
cd e:/LimbusCompanyPlotVideoGenerator/demo/frontend/electron-react-app
npm run electron-dev

e:/LimbusCompanyPlotVideoGenerator/demo/run_bootstrap.bat
