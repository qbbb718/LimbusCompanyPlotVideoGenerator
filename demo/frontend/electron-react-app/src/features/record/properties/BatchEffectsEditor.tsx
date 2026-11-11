/**
 * @module 「特效」页签的批量编辑面板
 *
 * <p>剧情列表里选中 2 条以上记录时，「特效」页签换成这个面板：一次改**所有选中记录**的
 * 起始转场 / 画面滤镜的勾选状态。与「文本」不同，这里**没有"应用"按钮**——
 * 勾选框本身就是动作（与单条面板一致），点一下整批算一步撤销。
 *
 * <h3>三方框（三态复选框）</h3>
 * 选中的记录状态不一致时（有的勾着、有的没勾），复选框显示成"横杠"（`indeterminate`）并标明
 * "3 条中 2 条已勾选"。点它的语义按"把这一批**变成**某个状态"来定：
 * <ul>
 *   <li>三方框 / 未勾选 → 点一下 = **全部勾上**（起始转场还要清掉其它两种，它们互斥）；</li>
 *   <li>全勾选 → 点一下 = **全部取消**（只删这一种，其它特效原样保留，与单条面板一致）。</li>
 * </ul>
 *
 * <p>数据形状、三态判断、写回规则全部复用 {@link module:record/effects}，
 * 所以批量与单条永远不会出现"同样的点击、不一样的结果"。
 *
 * @see module:properties/batchEdit 批量改写器（没变化就返回原记录）
 * @see module:properties/BatchTextEditor 「文本」页签的批量面板
 */
import React, { useEffect, useRef } from "react";
import {
  effectTriState,
  FILTER_OPTIONS,
  isEffectEnabled,
  TRANSITION_OPTIONS,
  type EffectOption,
} from "../effects";
import { BatchEditBar, useBatchEditStatus } from "./BatchEditBar";
import {
  BatchEditContext,
  effectEnabledMutator,
  transitionMutator,
} from "./batchEdit";
import "../RecordEditor.css";
import "./EffectsProperties.css";
import "./BatchEdit.css";

export interface BatchEffectsEditorProps {
  /** 选中的记录与写回函数（由 RecordEditor 组装） */
  batch: BatchEditContext;
}

/**
 * @component 三态复选框
 *
 * <p>原生复选框只能用 DOM 的 `indeterminate` 表达"部分勾选"（JS 里没有对应属性），
 * 所以在这里用 effect 写进去。
 */
const TriStateCheckbox: React.FC<{
  checked: boolean;
  mixed: boolean;
  name: string;
  onChange: () => void;
}> = ({ checked, mixed, name, onChange }) => {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = mixed;
    }
  }, [mixed]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={name}
      onChange={onChange}
    />
  );
};

/**
 * @component 特效页签的批量编辑面板
 */
const BatchEffectsEditor: React.FC<BatchEffectsEditorProps> = ({ batch }) => {
  const { records, indexes, apply, exit } = batch;
  const { status, report } = useBatchEditStatus();

  const count = records.length;
  /** 选中的记录里包含第 1 条：交叉溶解对它不生效（没有上一条可以叠） */
  const includesFirstRecord = indexes.includes(0);

  /** @function 报告一次批量改动的结果 */
  const reportApplied = (
    changed: number,
    action: "勾选" | "取消",
    name: string,
  ) => {
    if (changed > 0) {
      report(`${changed} 条记录已${action}「${name}」`);
      return;
    }
    report(`没有变化：这 ${count} 条记录已经是这个状态`, "info");
  };

  /**
   * @function 点一种起始转场
   *
   * <p>三方框 / 未勾选 → 全部勾上这一种（互斥，会清掉其它转场）；
   * 全勾选 → 全部取消（只删这一种）。
   */
  const toggleTransition = (option: EffectOption) => {
    const state = effectTriState(records, option.type);
    if (state === "all") {
      reportApplied(apply(transitionMutator(option.type, false)), "取消", option.name);
      return;
    }
    reportApplied(apply(transitionMutator(option.type, true)), "勾选", option.name);
  };

  /**
   * @function 点一种"只开关"的画面滤镜
   *
   * <p>与单条面板同一个口径：全勾选 → 全部取消；否则 → 全部勾上。
   */
  const toggleFilter = (option: EffectOption) => {
    const state = effectTriState(records, option.type);
    const enable = state !== "all";
    reportApplied(
      apply(effectEnabledMutator(option.type, enable)),
      enable ? "勾选" : "取消",
      option.name,
    );
  };

  /**
   * @function 渲染一行特效（复选框 + 名称 + 说明 + 三态读数）
   */
  const renderOption = (
    option: EffectOption,
    onToggle: (option: EffectOption) => void,
  ) => {
    const state = effectTriState(records, option.type);
    const checked = state === "all";
    const mixed = state === "mixed";
    const enabledCount = records.filter((record) =>
      isEffectEnabled(record.effects, option.type),
    ).length;
    const stateText = checked
      ? `全部已勾选（${count} 条）`
      : mixed
        ? `部分已勾选（${enabledCount}/${count} 条）`
        : "全部未勾选";

    return (
      <div
        key={option.type}
        className={`effect-item${checked || mixed ? " active" : ""}`}
      >
        <label className="effect-item-head">
          <TriStateCheckbox
            checked={checked}
            mixed={mixed}
            name={option.name}
            onChange={() => onToggle(option)}
          />
          <span className="effect-item-name">{option.name}</span>
        </label>
        <p className="effect-item-desc">{option.description}</p>
        <p className={`batch-effect-state${mixed ? " mixed" : ""}`}>
          {stateText}
          {checked ? "；点一下 = 全部取消" : "；点一下 = 全部勾上"}
        </p>
      </div>
    );
  };

  return (
    <div className="batch-edit batch-effects-editor">
      <BatchEditBar
        count={count}
        hint={`勾选 / 取消下面的特效会同时作用到选中的 ${count} 条记录，整批算一步（Ctrl+Z 一次撤销）；横杠表示选中的记录状态不一致。`}
        status={status}
        onExit={exit}
      />

      <h4>起始转场</h4>
      <p className="effects-hint">
        三种互斥：勾一种会把选中的记录上其它两种转场清掉。只影响导出视频开头几帧，
        记录时长与预览图不变。
      </p>
      <div className="effects-list">
        {TRANSITION_OPTIONS.map((option) => renderOption(option, toggleTransition))}
      </div>

      {includesFirstRecord && (
        <p className="effects-warning">
          选中的记录里有第 1 条：它没有「上一条记录」可以叠加，交叉溶解对它不生效
          （黑/白屏不受影响）。
        </p>
      )}

      <h4 style={{ marginTop: 18 }}>画面滤镜</h4>
      <p className="effects-hint">
        只作用于画面层（背景 / 立绘 / 临时图片），与起始转场不互斥，可以同时开。
      </p>
      <div className="effects-list">
        {FILTER_OPTIONS.map((option) => renderOption(option, toggleFilter))}
      </div>
    </div>
  );
};

export default BatchEffectsEditor;
