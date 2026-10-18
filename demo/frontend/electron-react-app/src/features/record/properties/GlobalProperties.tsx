/**
 * @component 全局设置（剧情编辑 → 全局设置 tab）
 *
 * 这里改的是 App 层持有的 projectSettings（与"设置"页面同一份对象），
 * 所以任何一项改动都会立刻影响预览图、导出视频与工程文件名：
 * - 项目名称：导出视频文件名前缀（"项目名称_"）与默认工程文件名；
 * - 剧情类型：剧情 → 后端 plot = true，人格故事 → plot = false（见 isPlotMode）；
 * - 视频尺寸：预览图与导出视频的分辨率（候选项与设置页共用 VIDEO_SIZE_OPTIONS）；
 * - 文字显示速度（全局）：一次性覆盖所有记录的 dialogue.speed，
 *   档位与"文本"tab 的"显示速度"完全一致（见 TEXT_SPEED_MIN / TEXT_SPEED_MAX）；
 * - 输出路径：与"设置"页面的输出路径完全一致（同一个字段、同一个目录选择对话框）；
 * - 三档音量：随导出请求使用。
 */
import React, { useEffect, useRef } from "react";
import { ProjectSettings } from "@types";
import {
  STORY_TYPE_PERSONALITY,
  STORY_TYPE_STORY,
  TEXT_SPEED_MAX,
  TEXT_SPEED_MIN,
  TEXT_SPEED_STEP,
  VIDEO_SIZE_OPTIONS,
  normalizeTextSpeed,
  parseVideoSizeKey,
  pickOutputDirectory,
  videoSizeKey,
} from "@features/common/utils/projectSettings";
import "../RecordEditor.css";

interface GlobalPropertiesProps {
  projectSettings: ProjectSettings;
  /** 更新项目设置（与"设置"页面共用 App 层的同一份状态） */
  onChange: (field: keyof ProjectSettings, value: any) => void;
  /**
   * 全局文字显示速度变化：除了写入 projectSettings，调用方还要把新速度
   * 统一同步到所有记录上（见 RecordEditor.handleGlobalTextSpeedChange）。
   */
  onTextSpeedChange?: (speed: number) => void;
  /** 从"文本"tab 的链接跳转过来时，滚动到并高亮"文字显示速度（全局）" */
  highlightTextSpeed?: boolean;
  /** 高亮动画结束（清掉标记，避免下次进入全局设置又闪一下） */
  onHighlightEnd?: () => void;
}

/** 音量滑块的取值范围：0 ~ 1 */
const VOLUME_RANGE = { min: 0, max: 1, step: 0.1 };

/** 跳转高亮持续时间（与 RecordEditor.css 的 text-speed-flash 动画时长一致） */
const HIGHLIGHT_DURATION_MS = 1600;

const GlobalProperties: React.FC<GlobalPropertiesProps> = ({
  projectSettings,
  onChange,
  onTextSpeedChange,
  highlightTextSpeed = false,
  onHighlightEnd,
}) => {
  const currentSizeKey = videoSizeKey(
    projectSettings.videoWidth,
    projectSettings.videoHeight,
  );

  // 全局文字显示速度：settings 里可能没有这个字段（旧工程 / 旧 localStorage），统一走归一化兜底
  const globalTextSpeed = normalizeTextSpeed(projectSettings.textSpeed);

  const textSpeedGroupRef = useRef<HTMLDivElement | null>(null);
  // 回调只用于高亮结束后清标记，用 ref 存一份，避免父组件每次渲染都重启动画
  const onHighlightEndRef = useRef(onHighlightEnd);
  onHighlightEndRef.current = onHighlightEnd;

  // 从"文本"tab 跳过来：滚动到速度滑块并闪一下边框，让用户一眼看到改在哪
  useEffect(() => {
    if (!highlightTextSpeed) return;
    textSpeedGroupRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
    });
    const timer = setTimeout(() => {
      onHighlightEndRef.current?.();
    }, HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [highlightTextSpeed]);

  /**
   * @function 选择输出路径
   * 与"设置 → 输出路径"的浏览按钮同一条路径：Electron 里弹原生目录选择框，
   * 浏览器里退化为输入框；取消时不改动现有值。
   */
  const handleOutputPathBrowse = async () => {
    try {
      const path = await pickOutputDirectory(projectSettings.outputPath);
      if (path) {
        onChange("outputPath", path);
      }
    } catch (error) {
      console.error("选择输出路径失败:", error);
      alert("无法打开目录选择对话框，请手动输入路径");
    }
  };

  /**
   * @function 切换视频尺寸
   * 同时改写 videoWidth / videoHeight，预览图与导出视频都按这个尺寸渲染。
   */
  const handleVideoSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseVideoSizeKey(e.target.value);
    if (!size) return;
    onChange("videoWidth", size.width);
    onChange("videoHeight", size.height);
  };

  /**
   * @function 修改全局文字显示速度
   * 交给上层处理：写 projectSettings 的同时把这个档位覆盖到所有记录上。
   * 没有回调时退化为只改设置，保证组件单独使用时也不会报错。
   */
  const handleTextSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = normalizeTextSpeed(e.target.value);
    if (onTextSpeedChange) {
      onTextSpeedChange(speed);
    } else {
      onChange("textSpeed", speed);
    }
  };

  /** 音量滑块：同一套结构渲染三档音量，避免复制三遍 */
  const renderVolumeSlider = (
    label: string,
    field: "bgmVolume" | "voiceVolume" | "sfxVolume",
  ) => (
    <div className="form-group" key={field}>
      <label>{label}</label>
      <div className="volume-slider">
        <input
          type="range"
          min={VOLUME_RANGE.min}
          max={VOLUME_RANGE.max}
          step={VOLUME_RANGE.step}
          value={projectSettings[field]}
          onChange={(e) => onChange(field, Number(e.target.value))}
        />
        <span>{Math.round((projectSettings[field] ?? 0) * 100)}%</span>
      </div>
    </div>
  );

  return (
    <div
      className="global-properties"
      style={{ paddingLeft: "25px", paddingRight: "25px" }}
    >
      <h4>全局设置</h4>

      <div className="form-group">
        <label>项目名称</label>
        <input
          type="text"
          value={projectSettings.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="导出视频文件名会加上“项目名称_”前缀"
        />
      </div>

      <div className="form-group">
        <label>剧情类型</label>
        <select
          value={projectSettings.storyType}
          onChange={(e) => onChange("storyType", e.target.value)}
        >
          <option value={STORY_TYPE_STORY}>剧情</option>
          <option value={STORY_TYPE_PERSONALITY}>人格故事</option>
        </select>
      </div>

      <div className="form-group">
        <label>视频尺寸</label>
        <select value={currentSizeKey} onChange={handleVideoSizeChange}>
          {VIDEO_SIZE_OPTIONS.map((opt) => (
            <option key={opt.label} value={`${opt.width}x${opt.height}`}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={textSpeedGroupRef}
        className={`form-group text-speed-group${
          highlightTextSpeed ? " highlight" : ""
        }`}
      >
        <label>文字显示速度（全局）</label>
        <div className="speed-slider">
          <input
            type="range"
            min={TEXT_SPEED_MIN}
            max={TEXT_SPEED_MAX}
            step={TEXT_SPEED_STEP}
            value={globalTextSpeed}
            onChange={handleTextSpeedChange}
            aria-label="文字显示速度（全局）"
          />
          <span>{globalTextSpeed}</span>
        </div>
        <div className="global-hint">
          数值越大文字显示越快（1 最慢，6 最快）。修改后会统一应用到所有文本的显示速度，
          覆盖各条记录在“文本”页里单独调过的速度；之后新增的记录也按这个速度。
        </div>
      </div>

      {renderVolumeSlider("BGM音量", "bgmVolume")}
      {renderVolumeSlider("语音音量", "voiceVolume")}
      {renderVolumeSlider("音效音量", "sfxVolume")}

      <div className="form-group">
        <label>输出路径</label>
        <div className="path-input-group">
          <input
            type="text"
            value={projectSettings.outputPath}
            onChange={(e) => onChange("outputPath", e.target.value)}
            placeholder="选择或输入视频导出目录..."
          />
          <button onClick={handleOutputPathBrowse}>浏览</button>
        </div>
      </div>
    </div>
  );
};

export default GlobalProperties;
