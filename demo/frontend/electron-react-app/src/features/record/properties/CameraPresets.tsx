/**
 * @module 摄像机页签 → 「预设」区块
 *
 * 渲染注册表（`preview/cameraPresets.ts`）里的镜头层效果：勾选即启用，启用后按定义渲染参数控件。
 * 本组件**不认识任何具体预设**——新增"推拉 / 旋转 / 晃动"只要往 `CAMERA_PRESETS` 追加一条定义，
 * 这里自动多出一张卡片（含开关、说明、参数、分组小标题），布局骨架不用改。
 *
 * <h3>自适应</h3>
 * 所有行都是 flex + wrap：属性栏可以拖到 300px 宽，参数一行放不下时整体换行，
 * 不会被裁掉；整个区块随 `.property-content` 滚动。
 *
 * <h3>数据</h3>
 * 读写都经 `preview/cameraPresets` 的通用函数，落点仍是 `record.effects`——
 * 与迁移前的「特效」页签完全同一份数据（旧工程不需要迁移）。
 */
import React from "react";
import { Record } from "@types";
import type { EffectVisual } from "@types";
import NumberField from "./NumberField";
import {
  CAMERA_PRESETS,
  groupPresets,
  isPresetEnabled,
  presetEntryOf,
  presetParamValue,
  togglePresetEffect,
  withPresetParam,
} from "../preview/cameraPresets";
import type { CameraPresetDefinition } from "../preview/cameraPresets";
import "./CameraProperties.css";

interface CameraPresetsProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /**
   * 预设清单；缺省用注册表 {@link CAMERA_PRESETS}。
   *
   * <p>留成参数是为了单测能塞一份"假预设"来证明面板不硬编码具体类型。
   */
  presets?: CameraPresetDefinition[];
}

/** 单条预设卡片（开关 + 说明 + 参数） */
const CameraPresetItem: React.FC<{
  preset: CameraPresetDefinition;
  effects: EffectVisual[];
  onChange: (effects: EffectVisual[]) => void;
}> = ({ preset, effects, onChange }) => {
  const entry = presetEntryOf(effects, preset.type);
  const enabled = isPresetEnabled(effects, preset.type);

  return (
    <div className={`camera-preset-item${enabled ? " active" : ""}`}>
      <label className="camera-preset-head">
        <input
          type="checkbox"
          checked={enabled}
          aria-label={preset.label}
          onChange={(event) =>
            onChange(togglePresetEffect(effects, preset.type, event.target.checked))
          }
        />
        <span className="camera-preset-name">
          <span className="camera-preset-emoji" aria-hidden="true">
            {preset.emoji}
          </span>
          {preset.label}
        </span>
      </label>

      <p className="camera-preset-desc">{preset.description}</p>

      {/* 参数只在启用后出现：没启用时调参数没有意义，也会让列表显得更吵 */}
      {enabled && preset.params.length > 0 && (
        <div className="camera-preset-params">
          {preset.params.map((param) => (
            <div className="camera-preset-param" key={param.key} title={param.hint}>
              <span className="camera-preset-param-label">{param.label}</span>
              <NumberField
                className="camera-preset-number"
                value={presetParamValue(entry, param)}
                min={param.min}
                max={param.max}
                integer={param.integer}
                ariaLabel={`${preset.label} ${param.label}`}
                title={param.hint}
                onChange={(value) =>
                  onChange(withPresetParam(effects, preset.type, param.key, value))
                }
              />
              {param.unit && (
                <span className="camera-preset-param-unit">{param.unit}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * @component 摄像机预设区块
 *
 * <p>由 {@link CAMERA_PRESETS}（或外部传入的清单）驱动；每张卡片的开关与参数都直接写回
 * `record.effects`，所以「预设」与「特效 → 起始转场」共用同一个数组、同一条撤销栈。
 */
const CameraPresets: React.FC<CameraPresetsProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  presets = CAMERA_PRESETS,
}) => {
  const effects = selectedRecord.effects ?? [];

  /** 写回整份 effects（其它特效原样保留） */
  const applyEffects = (next: EffectVisual[]) =>
    updateRecord(selectedRecordIndex, { ...selectedRecord, effects: next });

  return (
    <section className="camera-presets" aria-label="摄像机预设">
      <h5>预设</h5>
      <p className="camera-section-hint">
        镜头层的动态效果，可与「运镜」叠加。勾选即启用，取消勾选会删掉这一条；
        想看效果点预览顶部的「▶ 播放」。
      </p>

      {presets.length === 0 ? (
        <p className="camera-section-hint">还没有可用的摄像机预设。</p>
      ) : (
        <div className="camera-preset-list">
          {groupPresets(presets).map((group, index) => (
            <div
              className="camera-preset-group"
              key={group.group ?? `preset-group-${index}`}
            >
              {group.group && (
                <h6 className="camera-preset-group-title">{group.group}</h6>
              )}
              {group.presets.map((preset) => (
                <CameraPresetItem
                  key={preset.type}
                  preset={preset}
                  effects={effects}
                  onChange={applyEffects}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default CameraPresets;
