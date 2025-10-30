// 对话对齐方式
export enum DialogueAlign {
  LEFT = 'LEFT',
  CENTER = 'CENTER'
}

// 情绪枚举
export enum Emotion {
  NORMAL = 'NORMAL',
  HAPPY = 'HAPPY',
  SAD = 'SAD',
  ANGRY = 'ANGRY',
  SURPRISED = 'SURPRISED',
  FEAR = 'FEAR',
  DISGUST = 'DISGUST'
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

// 音频命令
export interface AudioCommand {
  type: string; // BGM, VOICE, SFX等
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
  audioCommands: AudioCommand[];
  isDirty: boolean;
}

// 角色
export interface MyCharacter {
  characterID: string;
  characterName: string;
  height: number;
  faction: string;
  portraits: Portrait[];
  colorBg: string; // 转换为hex字符串
  colorText: string; // 转换为hex字符串
}

// 背景资源
export interface Background {
  uuid: string;
  path: string;
  name: string;
  tags: string[];
}

// 音频资源
export interface Audio {
  uuid: string;
  path: string;
  name: string;
  type: string; // BGM, VOICE, SFX等
  tags: string[];
}

// 项目设置
export interface ProjectSettings {
  name: string;
  bgmVolume: number;
  voiceVolume: number;
  sfxVolume: number;
  bgmGain: number;
  voiceGain: number;
  sfxGain: number;
  outputPath: string;
  theme: string;
  storyType: 'STORY' | 'PERSONALITY'; // 剧情或人格故事
}
