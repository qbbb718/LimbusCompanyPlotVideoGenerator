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
export interface BackgroundVisual {
  /** 记录里内嵌的背景快照（后端只回这几个字段，没有 tags） */
  background: {
    uuid: string;
    path: string;
    name: string;
    /** 缩略图路径；资源管理里生成缩略图后由后端写入，老数据可能没有 */
    thumbnailPath?: string;
  };
  posX: number;
  posY: number;
  scale: number;
  visible: boolean;
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
  dim: boolean;
}

// 临时图片视觉元素（NPC、道具等）
export interface TempImageVisual {
  uuid: string;
  imagePath: string;
  posX: number;
  posY: number;
  scale: number;
  dim: boolean;
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

// 特效视觉元素（记录级特效条目）
export interface EffectVisual {
  /** 特效类型，取值见 EFFECT_TYPE_* 常量（三种起始转场互斥） */
  type: string;
  /**
   * 是否启用。缺省视为启用；面板里取消勾选时会直接把这条特效从数组里删掉，
   * 所以 effects 里存在的条目就是"已勾选"的。
   */
  enabled?: boolean;
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
  bgmGain: 1.0,
  voiceGain: 1.0,
  sfxGain: 1.0,
};

/** localStorage 键名 */
export const SETTINGS_STORAGE_KEY = "lcpgv_project_settings";
