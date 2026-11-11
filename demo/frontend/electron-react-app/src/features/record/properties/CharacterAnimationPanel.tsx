/**
 * @component 立绘 / 临时图片的「移动动画」编辑面板
 *
 * 挂在角色卡片里，负责把 {@code anim} 从"手写 JSON"变成"点点鼠标"：
 * - 添加：选一个预设（弹跳/发抖/呼吸/摇摆/闪烁/缩放脉冲）或一条关键帧时间轴；
 * - 调参：表单由 {@link PRESET_PARAMS} 元数据自动生成，加预设不用改这个组件；
 * - 关键帧：**时间轴**上摆菱形，点一下就把预览跳到那一帧，选中后在检查器里改值（见 KeyframeTimeline）。
 *
 * <p>数据约定：所有编辑都是**不可变更新**（改完返回新对象交给上层写回记录），
 * 撤销栈才能正常工作；`anim` 没有任何 clip 时上层应当把它置为 `undefined`，
 * 这样渲染端会走"完全没有动画"的原路径（旧工程逐像素不变）。
 *
 * <p>布局约定：**每一行都是可换行的 flex 组**（`.anim-toolbar` / `.anim-fields` + `.anim-field`），
 * 控件宽度一律显式给（原生 `input[type=number]` 默认约 170px、`select` 的 min-width 默认是 auto，
 * 不写宽度就会把属性面板顶出横向滚动）。面板自己是一个 container，窄了由 CSS 的
 * `@container` 改成整行布局——见 CharacterAnimationPanel.css 顶部的"自适应口径"。
 */
import React, { useState } from "react";

import type { AnimationClip, PresetId, SpriteAnimation } from "../animation/animationTypes";
import { isClipEnabled } from "../animation/animationTypes";
import {
  PRESET_PARAMS,
  createKeyframeClip,
  createPresetClip,
  createSpriteAnimation,
  presetChannels,
  presetLabel,
  withClipParam,
} from "../animation/clipEditing";
import { PRESET_IDS } from "../animation/presetRegistry";
import KeyframeTimeline from "./KeyframeTimeline";
import "./CharacterAnimationPanel.css";

interface CharacterAnimationPanelProps {
  /** 当前元素的动画（undefined = 没有动画） */
  anim?: SpriteAnimation;
  /** 写回记录；没有任何 clip 时传 undefined，让渲染端走原路径 */
  onChange: (next: SpriteAnimation | undefined) => void;
  /** 无障碍标签用的名字（角色名 / 图片名） */
  elementLabel: string;
  /**
   * 是否按剧情模式渲染（`plot`）。
   *
   * <p>人格故事模式（`plot = false`）下后端**不画立绘/临时图片**，这里的动画自然不会出现在成片里。
   * 置灰 + 提示，但**不禁用**：用户会在两种剧情类型之间来回切，
   * 切回来时之前调的动画要还在，也不能因为切模式下不了手。
   */
  plot?: boolean;
  /** 预览当前停在哪一帧（记录绝对帧）；时间轴用它画播放头 */
  previewFrame?: number | null;
  /** 请求预览跳到某一帧（点时间轴 / 关键帧时触发） */
  onSeekFrame?: (recordFrame: number) => void;
  /**
   * 一句台词本身的长度（`max(语音时长, 文字时长)`，帧）。
   *
   * <p>关键帧动画默认按它铺满：新建的关键帧 clip 时长直接取这个值，
   * 时间轴上也提供"对齐"按钮把已有 clip 拉到这个长度——
   * 否则用户得自己数台词多少帧，动画不是短一截就是长一截。
   */
  lineFrames?: number;
}

const CharacterAnimationPanel: React.FC<CharacterAnimationPanelProps> = ({
  anim,
  onChange,
  elementLabel,
  plot = true,
  previewFrame,
  onSeekFrame,
  lineFrames,
}) => {
  const clips = anim?.clips ?? [];
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<"preset" | "keyframes">("preset");
  const [addPreset, setAddPreset] = useState<PresetId>("bounce");

  /** 把新的 clip 列表写回；空列表 → 直接清掉 anim（渲染端走原路径） */
  const commitClips = (nextClips: AnimationClip[]) => {
    if (nextClips.length === 0) {
      onChange(undefined);
      setSelectedClipId(null);
      return;
    }
    onChange({ ...(anim ?? createSpriteAnimation()), clips: nextClips });
  };

  const updateClip = (clipId: string, patch: Partial<AnimationClip>) => {
    commitClips(clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)));
  };

  const handleAdd = () => {
    const clip =
      addKind === "preset"
        ? createPresetClip(addPreset)
        : // 关键帧动画默认铺满整句台词（max(语音, 文字)）；拿不到时长时退回默认 60 帧
          createKeyframeClip(lineFrames && lineFrames > 0 ? lineFrames : undefined);
    commitClips([...clips, clip]);
    setSelectedClipId(clip.id);
  };

  const handleRemove = (clipId: string) => {
    commitClips(clips.filter((clip) => clip.id !== clipId));
    if (selectedClipId === clipId) setSelectedClipId(null);
  };

  /** 每条动画的短名（标题栏摘要与卡片标题共用） */
  const clipTitle = (clip: AnimationClip): string =>
    clip.kind === "preset" && clip.preset ? presetLabel(clip.preset as PresetId) : "关键帧";

  /**
   * 整块折叠。
   *
   * <p>默认展开，但**一旦收起就把顶部摘要留在外面**（"2 条：弹跳 / 摇摆"），
   * 用户不用展开也知道这个元素上有没有动画——立绘/临时图片的属性面板本来就长，
   * 调完动画再调坐标时把这一块收起来能省很多滚动。
   */
  const [collapsed, setCollapsed] = useState(false);
  const panelBodyId = `animation-panel-body-${elementLabel}`;
  const summary =
    clips.length === 0
      ? "未设置"
      : `${clips.length} 条：${clips.map(clipTitle).join(" / ")}`;

  return (
    <div
      className={`animation-panel${plot ? "" : " is-inactive"}`}
      style={{
        // 人格故事模式：置灰但保留可编辑（见 props.plot 的说明）
        opacity: plot ? 1 : 0.55,
      }}
    >
      {/* 标题栏：整块折叠开关 + 摘要 */}
      <div className="animation-panel-header">
        <button
          type="button"
          className="animation-panel-toggle"
          aria-expanded={!collapsed}
          aria-controls={panelBodyId}
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "展开动画设置" : "收起动画设置（收起后动画仍然生效）"}
        >
          {collapsed ? "▸" : "▾"} 移动动画
        </button>
        <span className="animation-panel-summary">{summary}</span>
      </div>

      {!collapsed && (
        <div id={panelBodyId} className="animation-panel-body">
          {!plot && (
            <div className="global-hint" role="note">
              人格故事模式下动画不参与渲染，切回「剧情」自动生效。
            </div>
          )}

          {/* 「添加」行：类型 / 预设 / 添加按钮。窄面板里按组换行，
              不会把原生下拉挤出可视区。 */}
          <div className="anim-toolbar">
            <span className="anim-toolbar-label">添加</span>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as "preset" | "keyframes")}
              aria-label={`${elementLabel} 新增动画类型`}
            >
              <option value="preset">预设</option>
              <option value="keyframes">关键帧</option>
            </select>
            {addKind === "preset" && (
              <select
                value={addPreset}
                onChange={(e) => setAddPreset(e.target.value as PresetId)}
                aria-label={`${elementLabel} 选择预设`}
              >
                {PRESET_IDS.map((preset) => (
                  <option key={preset} value={preset}>
                    {presetLabel(preset)}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="anim-btn" onClick={handleAdd}>
              ＋ 添加
            </button>
          </div>

          {clips.length === 0 && (
            <div className="global-hint">
              还没有动画：选一个预设加进来，再用预览上方的 ▶ 播放看效果。
            </div>
          )}

          {clips.map((clip, index) => {
            const expanded = clip.id === selectedClipId;
            return (
              <div
                key={clip.id}
                className={`animation-clip-card${expanded ? " is-selected" : ""}`}
                data-testid={`animation-clip-${index + 1}`}
              >
                <div className="animation-clip-header">
                  <input
                    type="checkbox"
                    checked={isClipEnabled(clip)}
                    title="启用/停用这条动画（数据保留）"
                    aria-label={`${elementLabel} 动画 ${index + 1} 启用`}
                    onChange={(e) => updateClip(clip.id, { enabled: e.target.checked })}
                  />
                  <button
                    type="button"
                    className="animation-clip-title"
                    onClick={() => setSelectedClipId(expanded ? null : clip.id)}
                    aria-expanded={expanded}
                  >
                    {/* 箭头 + 序号 + 名字整块不拆行；帧数/循环塞不下就整体换到第二行 */}
                    <span className="animation-clip-name">
                      {expanded ? "▾" : "▸"} {index + 1}. {clipTitle(clip)}
                    </span>
                    <span className="animation-clip-meta">
                      · {clip.durationFrames} 帧 · {clip.loop ?? "once"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="anim-icon-btn"
                    onClick={() => handleRemove(clip.id)}
                    title="删除这条动画"
                  >
                    ✕
                  </button>
                </div>

                {expanded && (
                  <div className="animation-clip-body">
                    {/* 时长 / 延迟 / 循环：三个「标签 + 控件」组，按可用宽度 1~3 组一行 */}
                    <div className="anim-fields">
                      <div className="anim-field">
                        <span className="anim-field-label">时长(帧)</span>
                        <input
                          type="number"
                          min={1}
                          max={3000}
                          value={clip.durationFrames}
                          aria-label={`${elementLabel} 动画 ${index + 1} 时长`}
                          onChange={(e) =>
                            updateClip(clip.id, {
                              durationFrames: Math.max(1, Math.round(Number(e.target.value) || 1)),
                            })
                          }
                        />
                      </div>
                      <div className="anim-field">
                        <span className="anim-field-label">延迟(帧)</span>
                        <input
                          type="number"
                          min={0}
                          value={clip.startFrame ?? 0}
                          aria-label={`${elementLabel} 动画 ${index + 1} 延迟`}
                          onChange={(e) =>
                            updateClip(clip.id, {
                              startFrame: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </div>
                      <div className="anim-field is-wide">
                        <span className="anim-field-label">循环</span>
                        <select
                          value={clip.loop ?? "once"}
                          aria-label={`${elementLabel} 动画 ${index + 1} 循环`}
                          onChange={(e) =>
                            updateClip(clip.id, { loop: e.target.value as AnimationClip["loop"] })
                          }
                        >
                          <option value="once">播放一次</option>
                          <option value="loop">循环</option>
                          <option value="pingpong">往返</option>
                          <option value="hold">停在末帧</option>
                        </select>
                      </div>
                    </div>

                    {clip.kind === "preset" && clip.preset && (
                      <PresetParams
                        clip={clip}
                        elementLabel={elementLabel}
                        onParam={(key, value) =>
                          commitClips(
                            clips.map((item) =>
                              item.id === clip.id ? withClipParam(item, key, value) : item,
                            ),
                          )
                        }
                      />
                    )}

                    {clip.kind !== "preset" && (
                      <KeyframeTimeline
                        key={clip.id}
                        clip={clip}
                        elementLabel={elementLabel}
                        currentFrame={previewFrame}
                        onSeekFrame={onSeekFrame}
                        lineFrames={lineFrames}
                        onChange={(next) =>
                          commitClips(clips.map((item) => (item.id === clip.id ? next : item)))
                        }
                      />
                    )}

                    <div
                      className="global-hint"
                      title="循环模式下淡出会让每轮接缝闪一下，填 0 即可"
                    >
                      通道：{(clip.kind === "preset" && clip.preset
                        ? presetChannels(clip.preset as PresetId)
                        : clip.channels ?? []
                      ).join(" / ")}
                      ；循环模式淡出填 0。
                    </div>

                    <div className="anim-fields">
                      <div className="anim-field is-pair">
                        <span className="anim-field-label">淡入/淡出(帧)</span>
                        {/* 两个数值框是一个整体：换行时一起换，不会一个在上一行一个在下一行 */}
                        <div className="anim-number-pair">
                          <input
                            type="number"
                            min={0}
                            value={clip.fadeInFrames ?? 0}
                            aria-label={`${elementLabel} 动画 ${index + 1} 淡入`}
                            onChange={(e) =>
                              updateClip(clip.id, {
                                fadeInFrames: Math.max(0, Math.round(Number(e.target.value) || 0)),
                              })
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            value={clip.fadeOutFrames ?? 0}
                            aria-label={`${elementLabel} 动画 ${index + 1} 淡出`}
                            onChange={(e) =>
                              updateClip(clip.id, {
                                fadeOutFrames: Math.max(0, Math.round(Number(e.target.value) || 0)),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** 预设参数表单：完全由元数据生成（新增预设不用改 UI） */
const PresetParams: React.FC<{
  clip: AnimationClip;
  elementLabel: string;
  onParam: (key: string, value: number) => void;
}> = ({ clip, elementLabel, onParam }) => {
  const preset = clip.preset as PresetId;
  const params = PRESET_PARAMS[preset] ?? [];
  return (
    <div className="anim-fields">
      {params.map((meta) => {
        const current = Number(clip.params?.[meta.key] ?? meta.default);
        return (
          <div className="anim-field is-slider" key={meta.key}>
            <span className="anim-field-label" title={meta.hint}>
              {meta.label}
              {meta.unit ? `(${meta.unit})` : ""}
            </span>
            <input
              type="number"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={current}
              aria-label={`${elementLabel} ${presetLabel(preset)} ${meta.label}`}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) onParam(meta.key, value);
              }}
            />
            <input
              type="range"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={current}
              aria-label={`${elementLabel} ${presetLabel(preset)} ${meta.label} 滑块`}
              onChange={(e) => onParam(meta.key, Number(e.target.value))}
            />
          </div>
        );
      })}
      {clip.preset === "shake" && (
        <div className="global-hint">
          用确定性种子：每次导出轨迹一致，想换就删掉重加。
        </div>
      )}
    </div>
  );
};

export default CharacterAnimationPanel;
