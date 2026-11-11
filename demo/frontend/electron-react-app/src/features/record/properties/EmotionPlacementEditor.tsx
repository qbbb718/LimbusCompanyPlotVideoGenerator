/**
 * @component 情绪动画「摆放」编辑器（剧情编辑 → 立绘 → 情绪动画 → 摆放）
 *
 * <h3>它改的是什么</h3>
 * 只改记录里 `emotionAnim` 的三个字段：`offsetX / offsetY`（相对脸框中心，单位 = 头宽）与
 * `scale`（素材缩放倍率）。时序、播放参数、缩略图仍在「资源管理 → 序列帧动画」里定，
 * 这里一个字节都不碰——**微调摆放 ≠ 做动画**。
 *
 * <h3>为什么剧情编辑页也要能挪它</h3>
 * 同一段动画会被多条记录、多个角色复用。素材上的摆放（`poster`）面对的是"典型构图"，
 * 而具体某条记录里角色的站位、缩放、镜头推拉都可能不同：脸被放大 2 倍时特效还按原尺寸
 * 贴上去就偏了。逐条记录各留一份快照本来就是这套数据模型的设计（见
 * `animationClipAsset.ts` 的"素材是模板，记录是快照"），这里只是把最后一步交给用户手里。
 *
 * <h3>「还原」还原到哪</h3>
 * 还原到**素材上的原始摆放**（`assetPlacementOf`），而不是"居中 100%"：
 * 素材上的位置才是作者按脸调好的原始状态；把它清零会让所有记录都丢掉那套摆放。
 * 素材已经被删掉时无从比较，才回落到缺省值（脸框中心 + 原始尺寸）——那也正是渲染端
 * 在没有摆放信息时会画的位置，所以两种情况下「还原」的语义都成立。
 *
 * <h3>为什么是滑杆 + 数值框，而不是在预览里直接拖</h3>
 * 预览图是后端渲的栅格图，动画是叠在上面的一层 DOM，没有任何可以接住指针的"盒子"：
 * 要在预览里拖它，得先做一套"点中特效层"的命中检测与拖拽换算，而拖完最终还是要落回这三个数。
 * 滑杆 + 数值框（与本页签的立绘 X/Y/缩放、背景的偏移/缩放是同一套控件）成本低得多，
 * 且能输入 ±20 头宽这种滑杆够不到的精确值。
 */
import React from "react";

import NumberField from "./NumberField";
import type { EmotionPlacement } from "../animation/animationTypes";
import {
  EMOTION_OFFSET_LIMIT,
  EMOTION_SCALE_MAX,
  EMOTION_SCALE_MIN,
  PLACEMENT_EPSILON,
  defaultEmotionPlacement,
  isSamePlacement,
} from "../animation/animationTypes";
import "./EmotionPlacementEditor.css";

/**
 * 位置滑杆的可达范围（单位 = 头宽）。
 *
 * <p>±3 个头宽足以把一个贴脸的特效从头顶挪到胸口/腰，再远（比如挪到脚边、挪出画面）
 * 就交给数值框输入——数值框的上限是归一化时的 ±{@link EMOTION_OFFSET_LIMIT} 头宽。
 * 滑杆只做粗调，拉得动的地方越宽越难对准 0.01 的刻度。
 */
const OFFSET_SLIDER_LIMIT = 3;

/** 位置滑杆 / 数值框的步长（0.01 头宽 ≈ 1080p 下 1.83 像素，够细了） */
const OFFSET_STEP = 0.01;

/**
 * 缩放滑杆的可达范围（倍率）。
 *
 * <p>下限 0.05：再小就只剩几个像素，看不见也没法判断位置；上限 2：素材画布通常比头宽
 * 大好几倍，1 已经很大了，2 是"故意糊满全屏"的档。数值框仍可输入到
 * {@link EMOTION_SCALE_MAX}（归一化上限）。
 */
const SCALE_SLIDER_MIN = 0.05;
const SCALE_SLIDER_MAX = 2;
const SCALE_STEP = 0.01;

/**
 * 写回时保留两位小数。
 *
 * <p>滑杆给的是 0.30000000000000004 这种浮点尾数，直接存进记录后会在数值框里显示成
 * 一长串；两位小数（0.01 头宽 / 0.01 倍）在这个尺度上已经远超肉眼精度，也正好是
 * 面板上显示/比较的那套精度。
 */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 把值夹进滑杆范围（手写过超大值的工程文件不该让滑杆"贴边但读数不对"） */
const clampTo = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 数字的显示文本：两位小数，避免浮点尾数糊在界面上 */
const fmt = (value: number): string => value.toFixed(2);

/** 缩放 → 百分比文本（120%） */
const pct = (scale: number): string => `${Math.round(scale * 100)}%`;

/** 摆放里的三个字段 */
type PlacementKey = keyof EmotionPlacement;

interface EmotionPlacementEditorProps {
  /** 无障碍标签用的名字（角色名），与「选用动画」下拉同一套 */
  elementLabel: string;
  /** 这条记录当前的摆放 */
  value: EmotionPlacement;
  /**
   * 素材上的原始摆放（「还原」的目标）。
   *
   * <p>`null` / `undefined` = 素材已经不在资源管理里了：比较无从谈起，
   * 还原目标回落到 {@link defaultEmotionPlacement}。
   */
  baseline?: EmotionPlacement | null;
  /** 写回记录；只带变化的字段 */
  onChange: (patch: Partial<EmotionPlacement>) => void;
}

/** 单行控件的配置：显示名、范围、提示 */
interface PlacementRowSpec {
  key: PlacementKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 数值框允许输入的上下限（= 归一化时的夹取边界，手输比滑杆更自由） */
  fieldMin: number;
  fieldMax: number;
  /** 数值框的 title：单位说明 */
  unitHint: string;
  /** 只带这一个字段的写回参数 */
  patch: (next: number) => Partial<EmotionPlacement>;
}

/**
 * 摆放编辑器：位置 X / 位置 Y / 缩放三行，每行 = 数值框 + 单行 ↺ + 滑杆，
 * 标题行右侧一个「还原」把三行一起还原到素材上的摆放。
 */
const EmotionPlacementEditor: React.FC<EmotionPlacementEditorProps> = ({
  elementLabel,
  value,
  baseline,
  onChange,
}) => {
  // 没有素材时回到"渲染端的默认摆放"：那正是没有摆放信息时画面会画的位置
  const target = baseline ?? defaultEmotionPlacement();
  const customized = !isSamePlacement(value, target);

  const rows: PlacementRowSpec[] = [
    {
      key: "offsetX",
      label: "X 位置",
      min: -OFFSET_SLIDER_LIMIT,
      max: OFFSET_SLIDER_LIMIT,
      step: OFFSET_STEP,
      fieldMin: -EMOTION_OFFSET_LIMIT,
      fieldMax: EMOTION_OFFSET_LIMIT,
      unitHint: "水平偏移（单位：头宽；0 = 脸框中心，+ 向右）",
      patch: (next) => ({ offsetX: round2(next) }),
    },
    {
      key: "offsetY",
      label: "Y 位置",
      min: -OFFSET_SLIDER_LIMIT,
      max: OFFSET_SLIDER_LIMIT,
      step: OFFSET_STEP,
      fieldMin: -EMOTION_OFFSET_LIMIT,
      fieldMax: EMOTION_OFFSET_LIMIT,
      unitHint: "垂直偏移（单位：头宽；0 = 脸框中心，+ 向下）",
      patch: (next) => ({ offsetY: round2(next) }),
    },
    {
      key: "scale",
      label: "缩放",
      min: SCALE_SLIDER_MIN,
      max: SCALE_SLIDER_MAX,
      step: SCALE_STEP,
      fieldMin: EMOTION_SCALE_MIN,
      fieldMax: EMOTION_SCALE_MAX,
      unitHint: "素材缩放倍率（1 = 素材原始像素；立绘放大时它会跟着一起放大）",
      patch: (next) => ({ scale: round2(next) }),
    },
  ];

  // 素材摆放那一行：有素材时写清楚"还原会回到哪"，没有素材时说明为什么还原是居中
  const baselineText = baseline
    ? `素材摆放：X ${fmt(target.offsetX)} · Y ${fmt(target.offsetY)} 头宽 · 缩放 ${pct(target.scale)}`
    : "素材已删除：还原回居中、原始尺寸";
  const hintText = customized ? `已微调 · ${baselineText}` : baselineText;

  return (
    <div className="emotion-placement">
      <div className="emotion-placement-head">
        <span className="emotion-placement-title">摆放（相对头部区域）</span>
        <button
          type="button"
          className="transform-reset-btn"
          aria-label={`${elementLabel} 还原动画摆放`}
          title={
            baseline
              ? "还原成素材上的摆放：位置与缩放都回到「资源管理 → 序列帧动画」里调好的值"
              : "素材已不在资源管理里（可能被删除）：还原成居中、原始尺寸"
          }
          disabled={!customized}
          onClick={() =>
            onChange({
              offsetX: target.offsetX,
              offsetY: target.offsetY,
              scale: target.scale,
            })
          }
        >
          还原
        </button>
      </div>

      <p className="emotion-placement-hint">{hintText}</p>

      {rows.map((row) => {
        const current = value[row.key];
        const original = target[row.key];
        // 单行 ↺ 只复原这一行：已经等于素材值时禁用，免得点了一下什么都没发生
        const atOriginal = Math.abs(current - original) <= PLACEMENT_EPSILON;
        const originalText = row.key === "scale" ? pct(original) : fmt(original);
        return (
          <div className="transform-row" key={row.key}>
            <span className="transform-label">{row.label}</span>
            <NumberField
              className="transform-number"
              // 显示也按两位小数：老工程里可能存着 0.30000000000000004 这种值
              value={round2(current)}
              min={row.fieldMin}
              max={row.fieldMax}
              ariaLabel={`${elementLabel} 动画 ${row.label}`}
              title={row.unitHint}
              onChange={(next) => onChange(row.patch(next))}
            />
            <button
              type="button"
              className="transform-reset-icon-btn"
              aria-label={`${elementLabel} 还原动画 ${row.label}`}
              title={
                atOriginal
                  ? `${row.label}已经是素材上的值（${originalText}）`
                  : `只把${row.label}还原成素材上的值（${originalText}）`
              }
              disabled={atOriginal}
              onClick={() => onChange(row.patch(original))}
            >
              ↺
            </button>
            <div className="transform-slider">
              <input
                type="range"
                min={row.min}
                max={row.max}
                step={row.step}
                value={clampTo(current, row.min, row.max)}
                aria-label={`${elementLabel} 动画 ${row.label}滑块`}
                onChange={(event) => onChange(row.patch(Number(event.target.value)))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EmotionPlacementEditor;
