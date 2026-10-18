import React from "react";
import {
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_FADE_FROM_WHITE,
  Record,
  START_TRANSITION_FRAMES,
} from "@types";
import "../RecordEditor.css";
import "./EffectsProperties.css";

interface EffectsPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

/** 导出视频的帧率（与 RecordEditor 里 generateVideo 传的 30 一致），只用于把帧数换算成秒来提示 */
const EXPORT_FRAME_RATE = 30;

interface TransitionOption {
  /** 特效类型，与后端 EffectVisual.TYPE_* 一致 */
  type: string;
  /** 面板上的名称 */
  name: string;
  /** 叠加的是什么、看起来是什么效果 */
  description: string;
}

/**
 * 三种起始转场：叠的内容不同，淡出规则完全一样（见 START_TRANSITION_FRAMES）。
 * 顺序即优先级，与后端 StartTransition.kindOf 保持一致。
 */
const TRANSITION_OPTIONS: TransitionOption[] = [
  {
    type: EFFECT_TYPE_CROSS_DISSOLVE,
    name: "交叉溶解转场",
    description:
      "叠加「上一条记录的最后一帧」，把硬切变成叠化（第一条记录没有上一条，勾选也不会叠加）。",
  },
  {
    type: EFFECT_TYPE_FADE_FROM_BLACK,
    name: "黑屏转场",
    description: "整屏叠一层纯黑，即从黑屏淡入。",
  },
  {
    type: EFFECT_TYPE_FADE_FROM_WHITE,
    name: "白屏转场",
    description: "整屏叠一层纯白，即从白屏淡入。",
  },
];

/** 该类型是不是起始转场（互斥组） */
const isTransitionType = (type: string | undefined): boolean =>
  TRANSITION_OPTIONS.some((option) => option.type === type);

/**
 * @function 取记录当前生效的起始转场类型
 *
 * <p>与后端 {@code StartTransition.kindOf} 的优先级一致（交叉溶解 &gt; 黑屏 &gt; 白屏）：
 * 数据里同时存在多种时，面板上显示勾选的那一项就是导出视频时真正会用的那一项。
 * 正常情况下三种互斥，只会有一种。
 *
 * @param record 当前记录
 * @return 生效的特效类型；没有启用起始转场时返回 undefined
 */
const activeTransitionType = (record: Record): string | undefined => {
  const effects = record.effects || [];
  const enabled = (type: string) =>
    effects.some((effect) => effect?.type === type && effect.enabled !== false);

  return TRANSITION_OPTIONS.find((option) => enabled(option.type))?.type;
};

/**
 * @component 特效属性面板（"剧情编辑 → 特效"）
 *
 * <p>三种起始转场共用同一套逻辑：勾选后<b>只影响这一条记录导出视频时的开头</b>——
 * 开头 {@link START_TRANSITION_FRAMES} 帧在记录自己的画面上方叠一层图像，不透明度
 * 从 100% 线性降到 0%，之后就是记录自己的画面。三者叠的内容不同：
 * 交叉溶解叠"上一条记录的最后一帧"；黑屏/白屏转场叠纯黑/纯白（从黑屏/白屏淡入）。
 * 记录时长不变，预览图也不变（预览图只是一张静态画面）。
 *
 * <p>数据模型：勾选 = 往 {@code record.effects} 里加一条
 * {@code { type: "CROSS_DISSOLVE" | "FADE_FROM_BLACK" | "FADE_FROM_WHITE", enabled: true }}，
 * 并把其它起始转场删掉（三者互斥）；取消勾选 = 直接把这一条删掉。
 * 后端渲染时读的就是这份列表（见 StartTransition#kindOf），因此工程文件和导出请求
 * 里的特效都会原样保留。
 */
const EffectsProperties: React.FC<EffectsPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
}) => {
  const effects = selectedRecord.effects || [];
  const activeType = activeTransitionType(selectedRecord);
  const seconds = (START_TRANSITION_FRAMES / EXPORT_FRAME_RATE).toFixed(2);

  /**
   * @function 勾选/取消勾选某种起始转场
   *
   * <p>勾选：先清掉所有起始转场（三种互斥），再追加这一种，避免出现"黑屏盖在叠化上"。
   * 取消勾选：只删这一种，其它特效（包括以后加的非转场特效）原样保留。
   * @param type    特效类型
   * @param checked 勾选状态
   */
  const toggleTransition = (type: string, checked: boolean) => {
    const nextEffects = checked
      ? [
          ...effects.filter((effect) => !isTransitionType(effect?.type)),
          { type, enabled: true },
        ]
      : effects.filter((effect) => effect?.type !== type);

    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      effects: nextEffects,
    });
  };

  return (
    <div className="effects-properties">
      <h4>特效设置</h4>
      <p className="effects-hint">
        {`起始转场只作用在导出的视频上：开头 ${START_TRANSITION_FRAMES} 帧（30fps 下约 ${seconds} 秒）在本条画面上方叠加一层图像，不透明度从 100% 降到 0%，记录时长与预览图不变。三种转场互斥，勾选一种会取消其它两种。`}
      </p>

      <div className="effects-list">
        {TRANSITION_OPTIONS.map((option) => {
          const checked = activeType === option.type;
          return (
            <div
              key={option.type}
              className={`effect-item${checked ? " active" : ""}`}
            >
              <label className="effect-item-head">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleTransition(option.type, e.target.checked)}
                  aria-label={option.name}
                />
                <span className="effect-item-name">{option.name}</span>
              </label>
              <p className="effect-item-desc">{option.description}</p>
            </div>
          );
        })}
      </div>

      {activeType === EFFECT_TYPE_CROSS_DISSOLVE &&
        selectedRecordIndex === 0 && (
          <p className="effects-warning">
            当前是第一条记录，没有「上一条记录」可以叠加，交叉溶解不会生效；黑屏/白屏转场不受影响。
          </p>
        )}
    </div>
  );
};

export default EffectsProperties;
