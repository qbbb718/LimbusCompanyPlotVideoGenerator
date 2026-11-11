import type { EmotionAnim, SpriteAnimation } from "../../record/animation/animationTypes";

// 对话对齐方式
export enum DialogueAlign {
  LEFT = 'LEFT',
  CENTER = 'CENTER'
}

// Electron API类型定义
export interface ElectronAPI {
  // 获取应用版本
  getAppVersion: () => Promise<string>;

  // 获取应用路径
  getAppPath: () => Promise<string>;

  // 菜单事件监听
  onMenuNewProject: (callback: () => void) => void;
  onMenuOpenProject: (callback: () => void) => void;
  onMenuSaveProject: (callback: () => void) => void;
  onMenuExportVideo: (callback: () => void) => void;
  onMenuAbout: (callback: () => void) => void;
  /** 菜单「帮助 → 检查更新」：主进程已开始检查，界面只需切到设置页 */
  onMenuCheckUpdate: (callback: () => void) => void;

  // ---- 自动更新（主进程逻辑见 public/update-service.js）----
  /** 拉一次当前更新状态（挂载时用，之后靠 onUpdateStatus 推送） */
  getUpdateState: () => Promise<UpdateState>;
  checkForUpdates: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  installUpdate: () => Promise<{
    ok: boolean;
    installing?: boolean;
    version?: string;
    error?: string;
  }>;
  /** 用本地安装包更新；confirmed=false 只校验并返回待确认信息 */
  installUpdateFromFile: (
    filePath: string,
    options?: { confirmed?: boolean },
  ) => Promise<InstallFromFileResult>;
  chooseUpdateInstaller: () => Promise<{ canceled: boolean; filePath?: string }>;
  openUpdateLink: (url: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (callback: (state: UpdateState) => void) => () => void;

  // 移除监听器
  removeAllListeners: (channel: string) => void;

  // 文件操作
  openFile: () => Promise<{ canceled: boolean; filePaths?: string[] }>;
  openImageFile: () => Promise<{ canceled: boolean; filePaths?: string[] }>;
  /** 批量选择图片（立绘批量导入）：多选对话框，返回 filePaths 数组 */
  openImageFiles: () => Promise<{ canceled: boolean; filePaths?: string[] }>;
  saveFile: (defaultPath: string, data: string) => Promise<{ canceled: boolean; filePath?: string }>;
  readFile: (filePath: string) => Promise<Buffer>;
  /** 保存工程：更新已关联的工程文件（Ctrl+S） */
  writeFile: (
    filePath: string,
    data: string,
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  /** 保存工程：弹出保存对话框并写入（首次保存 / 另存为） */
  saveProjectFile: (
    defaultPath: string,
    data: string,
  ) => Promise<{
    canceled: boolean;
    success?: boolean;
    filePath?: string;
    error?: string;
  }>;
  /** 取文件选择框所选文件的真实路径（用于记住工程文件位置） */
  getPathForFile: (file: File) => string;
  selectDirectory: () => Promise<{ canceled: boolean; path?: string }>;

  // 打开资源目录
  openResourceFolder: (resourceType: "characters" | "backgrounds" | "audios") => Promise<{ success: boolean; path?: string; error?: string }>;

  // 打开任意文件夹（视频导出成功弹窗使用）
  openFolder: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;

  // 通知
  showNotification: (title: string, body: string) => Promise<void>;

  // 开发者工具
  openDevTools: () => Promise<void>;

  // 窗口控制
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // 获取系统信息
  getPlatform: () => string;
}

// 注意：Window接口已在react-app-env.d.ts中定义

/**
 * 摄像机：把「世界坐标」映射到「场景画布 1920×1080」。
 *
 * <p>只影响场景层（背景 / 立绘 / 临时图片）；边框、对话框、角色名片、地点牌、台词都在设计画布上
 * 直接绘制，不受它影响。字段与后端 {@code com.lbc_plot.render.video.Camera} 一一对应。
 *
 * <p>三个字段是**起点**；可选 `to` 是终点、`easing` 是起点→终点之间的缓动。
 * 没有 `to` = 静止镜头。缺省值 (960, 540, 1) 是恒等变换 = 加摄像机之前的效果。
 */
export interface RecordCamera {
  /** 取景中心 X（世界坐标；960 = 画布中心） */
  centerX: number;
  /** 取景中心 Y（世界坐标；540 = 画布中心） */
  centerY: number;
  /** 1 = 取景框正好 1920×1080；2 = 放大一倍 */
  zoom: number;
  /** 终点（缺省 = 静止镜头）；形状与起点相同 */
  to?: { centerX: number; centerY: number; zoom: number };
  /** 缓动：linear / easeIn / easeOut / easeInOut（缺省 linear） */
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
  /**
   * 从起点走到终点的时长（帧，整数，最小 1）；缺省 24。
   *
   * <p>只有"有终点"时才有意义：走完之后镜头**停住**，等这条记录剩下的时间播完。
   * 预览与导出用同一套进度公式（cameraView.cameraProgressOf / 后端 RenderOfVideo）。
   */
  moveFrames?: number;
}

// 情绪枚举 - 与后端保持一致
export enum Emotion {
  NORMAL = 'normal',
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  SURPRISED = 'surprised',
  CONFUSED = 'confused',
  NERVOUS = 'nervous',
  BLUSH = 'blush',
  HURT = 'hurt'
}

// 角色引用
export interface CharacterRef {
  characterID: string;
  characterName: string;
  height: number;
  faction: string;
  colorBg: string; // 转换为hex字符串
  colorText: string; // 转换为hex字符串
}

// 对话
export interface Dialogue {
  text: string;
  location: string;
  speakerC: CharacterRef[];
  speakerName: string;
  faction: string;
  align: DialogueAlign;
  speed: number;
  emotion: Emotion;
  /**
   * 说话人类型：true = 自由文本。
   * 自由文本不带角色名片，说话人不上屏，对话内容以旁白字体/字号显示在画面水平+垂直中心。
   */
  freeText?: boolean;
  /** 自由文本：加粗 */
  bold?: boolean;
  /** 自由文本：斜体 */
  italic?: boolean;
  /** 自由文本：隐藏UI（自由文本模式下默认勾选；勾选后不渲染对话框/名片/地点牌） */
  hideUI?: boolean;
  /** 自由文本：文字颜色（#RRGGBB；为空时使用默认文字颜色，与旁白一致） */
  freeTextColor?: string;
  /** 自由文本：字号（设计画布像素；<=0 时使用默认字号） */
  freeTextFontSize?: number;
  /** 自由文本：文字中心相对画面中心的 X 偏移（设计画布像素，正数向右） */
  freeTextX?: number;
  /** 自由文本：文字中心相对画面中心的 Y 偏移（设计画布像素，正数向下） */
  freeTextY?: number;
}

/** 自由文本默认文字颜色（与后端 ProjectConfig.DEFAULT_TEXT_COLOR 一致） */
export const DEFAULT_FREE_TEXT_COLOR = "#FBDBB3";
export const DEFAULT_FREE_TEXT_FONT_SIZE = 36;

// 背景视觉元素
/**
 * 背景视觉元素。
 *
 * <p>多张背景之间的**层级由 `Record.bg` 的数组顺序决定**（首项在画面最前），这个接口本身
 * 不带 z 字段——与 `CharacterVisual` / `TempImageVisual` 同一套约定，见 {@link Record.bg}。
 */
export interface BackgroundVisual {
  /** 记录里内嵌的背景快照（后端只回这几个字段，没有 tags） */
  background: {
    uuid: string;
    path: string;
    name: string;
    /** 缩略图路径；资源管理里生成缩略图后由后端写入，老数据可能没有 */
    thumbnailPath?: string;
  };
  /**
   * 背景中心相对画面中心的 X 偏移（设计画布像素，0 = 居中）。
   * 数值不设上下限：放大后可超过画布尺寸，把背景完全移出画面。
   */
  posX: number;
  /** 背景中心相对画面中心的 Y 偏移（设计画布像素，0 = 居中） */
  posY: number;
  /** 以「等比铺满设计画布」为 1.0 的缩放（1 = 与默认全屏背景一致，2 = 长宽各放大一倍） */
  scale: number;
  visible: boolean;
  /**
   * 是否压暗（剧情编辑 → 背景 → 压暗）。
   *
   * <p>与立绘 / 临时图片的「压暗」同一口径：压暗一半（后端 `ImageDarkener.darkenImage(image, 0.5f)`，
   * 预览里对应 `.preview-scene-item.dim { filter: brightness(0.5) }`）。
   * 旧工程没有这个字段时按 `false` 处理，行为与加压暗之前完全一致。
   */
  dim?: boolean;
}

// 立绘
export interface Portrait {
  portraitID: string;
  characterID: string;
  imagePath: string;
  portName: string;
  emotion: Emotion;
  faceX: number;
  faceY: number;
  length: number;
  adjX: number;
  adjY: number;
  thumbnailPath: string;
  /**
   * 是否为该角色的默认立绘。由后端从 character_portraits.is_default 读出，
   * 是默认立绘的唯一真实来源（不要再依赖 portraits[0] 的位置约定）。
   */
  defaultPortrait?: boolean;
  file?: File; // 仅前端使用，上传到后端后清除，不序列化到 JSON
}

// 角色视觉元素
export interface CharacterVisual {
  chara: CharacterRef;
  portrait: Portrait;
  posX: number;
  posY: number;
  adjX: number;
  adjY: number;
  /**
   * 用户手动缩放（1 = 不缩放，缺省按 1 处理）。
   *
   * 后端会把它乘在「由立绘裁剪框推导出的缩放」之上，并按脸框中心重新计算 posX/posY，
   * 所以同一份坐标在任何输出分辨率下都一致。旧工程没有这个字段时行为与加缩放之前完全相同。
   */
  scale?: number;
  dim: boolean;
  /**
   * 移动动画装备（预设 + 关键帧）。缺省/`null` = 不动，渲染走原来的路径、逐像素不变。
   *
   * <p>语义见 `docs/立绘动画设计.md`：动画是**相对摆位**的增量，
   * 不会覆盖 posX/posY，也不会覆盖用户缩放。
   */
  anim?: SpriteAnimation;
  /**
   * 情绪动画（序列帧）。缺省/`null` = 没有，渲染走原路径、逐像素不变。
   *
   * <p>它是立绘的**子级**：以脸框中心为锚点，跟着立绘一起位移/旋转/缩放。
   * 时序（每张图占几帧）随记录内联保存，只有像素按 `clipId` 去
   * `assets/animation-clips/<id>/frames/` 取。
   *
   * <p>摆放（`offsetX / offsetY / scale`）同样内联保存：初值抄自素材的 `poster`，
   * 之后可在「剧情编辑 → 立绘 → 情绪动画 → 摆放」按记录微调（不影响素材与别的记录）。
   */
  emotionAnim?: EmotionAnim;
}

// 临时图片视觉元素（NPC、道具等）
export interface TempImageVisual {
  uuid: string;
  imagePath: string;
  posX: number;
  posY: number;
  scale: number;
  dim: boolean;
  /** 移动动画装备；缺省 = 不动（见 CharacterVisual.anim） */
  anim?: SpriteAnimation;
}

/**
 * 起始转场的淡出帧数（三种转场共用，与后端 StartTransition.FRAMES 一致）：
 * 视频开头这 20 帧里叠加层不透明度从 100% 线性降到 0%。
 */
export const START_TRANSITION_FRAMES = 20;

/**
 * 特效类型：交叉溶解。
 * 勾选后渲染视频时，本条记录开头会叠加上一条记录的最后一帧，
 * 不透明度从 100% 线性降到 0%（共 START_TRANSITION_FRAMES 帧）。需要上一条记录。
 * 取值与后端 EffectVisual.TYPE_CROSS_DISSOLVE 一致。
 */
export const EFFECT_TYPE_CROSS_DISSOLVE = "CROSS_DISSOLVE";

/**
 * 特效类型：黑屏转场。
 * 勾选后视频开头整屏叠一层纯黑再淡出，即从黑屏淡入（共 START_TRANSITION_FRAMES 帧）。
 * 取值与后端 EffectVisual.TYPE_FADE_FROM_BLACK 一致。
 */
export const EFFECT_TYPE_FADE_FROM_BLACK = "FADE_FROM_BLACK";

/**
 * 特效类型：白屏转场。
 * 勾选后视频开头整屏叠一层纯白再淡出，即从白屏淡入（共 START_TRANSITION_FRAMES 帧）。
 * 取值与后端 EffectVisual.TYPE_FADE_FROM_WHITE 一致。
 */
export const EFFECT_TYPE_FADE_FROM_WHITE = "FADE_FROM_WHITE";

/**
 * 特效类型：镜头摇动（属于**镜头层预设**，开关在「剧情编辑 → 摄像机 → 预设」）。
 *
 * <p>按帧轻微晃动"看世界的那台相机"：只影响背景 / 立绘 / 临时图片（世界层），
 * 对话框、地点牌、角色名片与边框暗角画在设计画布上，**UI 与遮罩不受影响**。
 * 与三种起始转场互不冲突，可以同时开（同写在 `record.effects` 里，按 type 区分）。
 * 取值与后端 EffectVisual.TYPE_CAMERA_SHAKE 一致（公式见 preview/cameraShake.ts 与 CameraShake.java，
 * 注册表见 preview/cameraPresets.ts）。
 */
export const EFFECT_TYPE_CAMERA_SHAKE = "CAMERA_SHAKE";

/**
 * 特效类型：T 巢滤镜（「剧情编辑 → 特效」里的画面层调色开关）。
 *
 * <p>把整幅画面压成 T 巢那种棕褐色老照片：先算亮度（Rec.601），再把亮度映射成一条
 * "暗部偏红褐、亮部偏米白"的单色带。**只作用于画面层**（背景 / 立绘 / 临时图片）——
 * 后端在场景画布上就染完了，UI 与台词是第二趟才叠上去的，所以按钮/面板/文本框
 * 天然不会被染色（见 `render/video/TCorpFilter.java`）。
 * 取值与后端 EffectVisual.TYPE_T_CORP_FILTER 一致（曲线见 preview/tCorpFilter.ts）。
 */
export const EFFECT_TYPE_T_CORP_FILTER = "T_CORP_FILTER";

// 特效视觉元素（记录级特效条目）
export interface EffectVisual {
  /**
   * 特效类型，取值见 EFFECT_TYPE_* 常量。
   *
   * <p>三种起始转场互斥（「特效」页签）；镜头摇动等**镜头层预设**也写在这里，
   * 由「摄像机 → 预设」页签读写。比较类型时忽略大小写（后端 EffectVisual.isEnabledType）。
   */
  type: string;
  /**
   * 是否启用。缺省视为启用；面板里取消勾选时会直接把这条特效从数组里删掉，
   * 所以 effects 里存在的条目就是"已勾选"的。
   */
  enabled?: boolean;
  /** 镜头摇动的幅度（屏幕像素）；缺省见 DEFAULT_CAMERA_SHAKE_AMPLITUDE */
  amplitude?: number;
  /** 镜头摇动的周期（帧）；缺省见 DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES */
  periodFrames?: number;
  /** 镜头摇动持续多少帧；缺省 0 = 整条记录（与加这个参数之前的行为一致） */
  durationFrames?: number;
  /** 镜头摇动渐入多少帧；缺省 0 = 一开始就是满幅度 */
  fadeInFrames?: number;
  /** 镜头摇动渐出多少帧；缺省 0 = 不渐出（对齐"抖动结束"，持续时长为 0 时对齐记录结尾） */
  fadeOutFrames?: number;
}

// 音频类型枚举
export enum AudioType {
  BGM = 'bgm',
  VOICE = 'voice',
  SFX = 'sfx'
}

// 音频命令
export interface AudioCommand {
  type: AudioType;
  path: string;
  volume: number;
  startTime: number;
  duration: number;
}

/**
 * 工程文件里记录附带的分组快照。
 * 分组（剧情列表里的"图层文件夹"）在运行时由 workspace 的 groups 数组持有，
 * 记录本身只记 groupId；保存工程时把分组名称/折叠状态作为快照写到每条记录上，
 * 这样工程文件仍是后端认识的"记录数组"，导入时也能还原分组（详见 recordGroups.ts）。
 */
export interface RecordGroupStamp {
  id: string;
  /** 分组名称（保存时的快照；导入时以第一条记录上的名称为准） */
  name?: string;
  /** 是否折叠（保存时的快照） */
  collapsed?: boolean;
}

// 记录
export interface Record {
  uuid: string;
  durationFrames: number;
  dialogue: Dialogue;
  /**
   * 背景视觉元素列表，**数组顺序就是层级**：首项在画面最前（「背景」列表最上 = 画面最前），
   * 末项在最底层。与 `chars` / `tempImages` 是同一套约定（后端渲染时倒序遍历：末尾先画、首项后画），
   * 所以「上移 / 下移」就是交换相邻两项，保存 / 加载、预览、播放、导出都直接用这个顺序。
   */
  bg: BackgroundVisual[];
  chars: CharacterVisual[];
  tempImages: TempImageVisual[];
  effects: EffectVisual[];
  audioCommands: AudioCommand[];
  isDirty?: boolean;
  /**
   * 所属分组 id；undefined 表示未分组。
   * 分组成员在记录数组中总是连续的一段（见 recordGroups.moveRecords），
   * 因此拖动记录/分组内记录的播放顺序与列表显示顺序一致。
   */
  groupId?: string;
  /** 仅在读写工程文件时出现：分组名称与折叠状态的快照；运行时请用 groupId */
  group?: RecordGroupStamp;
  /**
   * 摄像机（每条记录一个）；缺省 = 恒等变换（960, 540, 1），与旧工程一致。
   * 由「剧情编辑 → 摄像机模式」写入，渲染时只作用于场景层。
   */
  camera?: RecordCamera;
}

// 角色
export interface MyCharacter {
  characterID: string;
  characterName: string;
  height: number;
  faction: string;
  colorBg: string;
  colorText: string;
  tags: string[];
  portraits: Portrait[];
  characterCardImagePath?: string;
}

// 音频
export interface Audio {
  uuid: string;
  name: string;
  path: string;
  type: AudioType;
  tags: string[];
}

// 背景
export interface Background {
  uuid: string;
  name: string;
  path: string;
  thumbnailPath?: string;
  tags: string[];
}

// 项目设置
export interface ProjectSettings {
  name: string;
  storyType: string;
  outputPath: string;
  theme: string;
  videoWidth: number;
  videoHeight: number;
  bgmVolume: number;
  voiceVolume: number;
  sfxVolume: number;
  /**
   * 文字显示速度（全局）：1 = 极慢 … 6 = 极快，档位与后端
   * RenderOfVideo.getUnifiedSpeed 一致。改动会统一写到所有记录上，
   * 新增记录也用它作为初始值（见 RecordEditor.createNewRecord）。
   */
  textSpeed?: number;
  /**
   * 结尾停留帧数（工程级）：{@code 时长 = max(文字, 音频, 动画) + stayFrames}。
   *
   * <p>直接影响每条记录的成片长度，也进片段缓存指纹；缺省 75（与后端
   * {@code ProjectConfig.DEFAULT_STAY_FRAMES} 一致）。改动后重新导出会强制重渲缓存片段。
   */
  stayFrames?: number;
  /**
   * 镜头自动跟随说话人（**工程级**开关；「摄像机」页签最下面「构图辅助」里的那个勾选框）。
   *
   * <p>勾上之后，用户**移动说话人的立绘**或**切换说话人**时，如果说话人已经不在可视范围里
   * （背景宽于 16:9 或镜头被推进导致的），就自动把镜头对到说话人身上：
   * 水平尽量居中立绘、垂直只做最小必要调整，并把镜头框整体夹在背景图片范围内。
   *
   * <p>手动调整镜头永远优先——自动跟随只在上述两个动作发生时重算一次，不会在后台覆盖用户的手动结果。
   * 规则实现在 `record/preview/cameraFollow.ts`，写入的是**记录自己的** camera（随记录一起保存），
   * 所以开关本身只影响编辑时的行为，不影响已有工程的成片。
   *
   * <p>缺省 false（老工程 / 老 localStorage 里没有这个字段）：不改变任何既有行为。
   */
  cameraFollowSpeaker?: boolean;
  bgmGain: number;
  voiceGain: number;
  sfxGain: number;
  projectName?: string;
  projectVersion?: string;
  author?: string;
  description?: string;
  outputDirectory?: string;
  fps?: number;
  resolution?: {
    width: number;
    height: number;
  };
  audioSettings?: {
    bgmVolume: number;
    sfxVolume: number;
    voiceVolume: number;
  };
  uiSettings?: {
    theme: 'light' | 'dark';
    language: string;
  };
}

/** 默认项目设置 */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  name: "新项目",
  storyType: "STORY",
  outputPath: "",
  theme: "default",
  videoWidth: 1920,
  videoHeight: 1080,
  bgmVolume: 0.7,
  voiceVolume: 0.8,
  sfxVolume: 0.7,
  // 与后端 ProjectConfig.DEFAULT_DIALOGUE_SPEED 一致（3 = 标准速度）
  textSpeed: 3,
  // 与后端 ProjectConfig.DEFAULT_STAY_FRAMES 一致（75 帧 = 2.5 秒 @30fps）
  stayFrames: 75,
  // 镜头自动跟随说话人：缺省关（开着会改变用户已有的镜头构图，必须是显式选择）
  cameraFollowSpeaker: false,
  bgmGain: 1.0,
  voiceGain: 1.0,
  sfxGain: 1.0,
};

/** localStorage 键名 */
export const SETTINGS_STORAGE_KEY = "lcpgv_project_settings";
