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
  storyType: string;
  videoWidth: number;
  videoHeight: number;
  /**
   * 结尾停留帧数（工程级）：时长 = max(文字, 音频, 动画) + stayFrames。
   *
   * <p>随工程文件往返（见 projectFile.ts 的 ProjectFileSettings）；缺省 75。
   * 与 `@features/common/types` 里的同名类型保持一致。
   */
  stayFrames?: number;
}
