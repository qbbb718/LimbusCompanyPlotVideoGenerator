// 对话对齐方式
export enum DialogueAlign {
  LEFT = 'LEFT',
  CENTER = 'CENTER'
}

// Electron API类型定义
export interface ElectronAPI {
  // 获取应用版本
  getAppVersion: () => Promise<string>;

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
  saveFile: (defaultPath: string, data: string) => Promise<{ canceled: boolean; filePath?: string }>;
  readFile: (filePath: string) => Promise<Buffer>;

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
}

// 背景视觉元素
export interface BackgroundVisual {
  background: {
    uuid: string;
    path: string;
    name: string;
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

// 特效视觉元素
export interface EffectVisual {
  // 特效属性，根据需要扩展
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

// 记录
export interface Record {
  uuid: string;
  durationFrames: number;
  dialogue: Dialogue;
  bg: BackgroundVisual[];
  chars: CharacterVisual[];
  effects: EffectVisual[];
  audio: AudioCommand[];
  audioCommands: AudioCommand[];
  isDirty?: boolean;
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
  tags: string[];
}

// 项目设置
export interface ProjectSettings {
  name: string;
  storyType: string;
  outputPath: string;
  theme: string;
  bgmVolume: number;
  voiceVolume: number;
  sfxVolume: number;
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
