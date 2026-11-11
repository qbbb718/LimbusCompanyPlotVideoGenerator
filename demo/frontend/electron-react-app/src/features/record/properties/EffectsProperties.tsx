import React from "react";
import { EFFECT_TYPE_CROSS_DISSOLVE, Record, START_TRANSITION_FRAMES } from "@types";
import {
  activeTransitionType,
  FILTER_OPTIONS,
  isEffectEnabled,
  removeEffectType,
  setEffectEnabled,
  setTransition,
  TRANSITION_OPTIONS,
} from "../effects";
import "../RecordEditor.css";
import "./EffectsProperties.css";

/**
 * @module 特效属性面板（"剧情编辑 → 特效"，单条记录）
 *
 * <p>三种起始转场共用同一套逻辑：勾选后<b>只影响这一条记录导出视频时的开头</b>——
 * 开头 {@link START_TRANSITION_FRAMES} 帧在记录自己的画面上方叠一层图像，不透明度
 * 从 100% 线性降到 0%，之后就是记录自己的画面。
 *
 * <p>数据模型：勾选 = 往 {@code record.effects} 里加一条 `{ type, enabled: true }`，
 * 并把其它起始转场删掉（三者互斥）；取消勾选 = 把这一条删掉。
 *
 * <p><b>写法收口</b>：选项清单、三态判断与"勾选/取消"的写回形状都在
 * {@link module:record/effects}，批量编辑（{@link module:properties/BatchEffectsEditor}）
 * 与这个面板走同一份规则，不会出现两边行为不一致。
 *
 * <p><b>镜头摇动不在这个页签</b>：它是镜头层的动态效果，已归到「摄像机 → 预设」
 * （见 `preview/cameraPresets.ts`）。数据同样写在 `record.effects` 里，只是按 `type` 区分，
 * 所以两个页签共用同一个数组、互不干扰。
 */

interface EffectsPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

/** 导出视频的帧率（与 RecordEditor 里 generateVideo 传的 30 一致），只用于把帧数换算成秒来提示 */
const EXPORT_FRAME_RATE = 30;

/**
 * @component 特效属性面板
 *
 * <p>T 巢滤镜（{@link FILTER_OPTIONS}）与三种转场不同：它不是"开头几帧的叠加层"，
 * 而是把<b>整幅画面</b>调成棕褐色。影响的是预览图、播放与导出成片，但<b>只染画面层</b>
 * （背景/立绘/临时图片），UI 与台词不受影响——层次边界在后端合成时就定死了，
 * 见 `render/video/TCorpFilter.java`。它与起始转场<b>不互斥</b>，可以同时开。
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
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      effects: checked ? setTransition(effects, type) : removeEffectType(effects, type),
    });
  };

  return (
    <div className="effects-properties">
      <h4>特效设置</h4>
      <p className="effects-hint">
        {`只作用于导出视频：开头 ${START_TRANSITION_FRAMES} 帧（约 ${seconds} 秒）叠一层图像淡出，记录时长与预览图不变；三种互斥。`}
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
            第一条记录：没有「上一条记录」可以叠加，交叉溶解不生效（黑/白屏不受影响）。
          </p>
        )}

      <h4 style={{ marginTop: 18 }}>画面滤镜</h4>
      <p className="effects-hint">
        只作用于画面层（背景 / 立绘 / 临时图片）：预览图与导出视频都会跟着变。
        对话框、地点牌、角色名片与台词文字不受影响。
      </p>
      <div className="effects-list">
        {FILTER_OPTIONS.map((option) => {
          const checked = isEffectEnabled(effects, option.type);
          return (
            <div key={option.type} className={`effect-item${checked ? " active" : ""}`}>
              <label className="effect-item-head">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    updateRecord(selectedRecordIndex, {
                      ...selectedRecord,
                      effects: setEffectEnabled(effects, option.type, e.target.checked),
                    })
                  }
                  aria-label={option.name}
                />
                <span className="effect-item-name">{option.name}</span>
              </label>
              <p className="effect-item-desc">{option.description}</p>
            </div>
          );
        })}
      </div>

      {/* 指路而不是入口：镜头摇动是镜头层效果，控件已经搬到「摄像机 → 预设」 */}
      <p className="effects-hint" style={{ marginTop: 12, marginBottom: 0 }}>
        镜头摇动在「摄像机」页签的「预设」区域；这里只管起始转场与画面滤镜。
      </p>
    </div>
  );
};

export default EffectsProperties;
