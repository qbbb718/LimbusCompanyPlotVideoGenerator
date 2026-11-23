import React, { useEffect, useRef, useState } from "react";
import { MyCharacter, Portrait } from "@types";
import PortraitCard from "./PortraitCard";
import { isDefaultPortraitId } from "@features/common/utils/portraitUtils";
import type { PortraitDropPosition } from "@features/common/utils/portraitUtils";
import type { PortraitBatchResult } from "@features/common/utils/portraitBatch";

/** 立绘批量操作进度（批量套用裁剪 / 批量导入 / 批量删除） */
export interface PortraitBatchProgress {
  kind: "crop" | "import" | "delete";
  done: number;
  total: number;
}

/** 立绘批量操作结果提示（文案由 `utils/portraitBatch` 的结果描述函数产出） */
export type PortraitBatchMessage = PortraitBatchResult;

interface PortraitsSectionProps {
  character: MyCharacter;
  onEditPortrait: (portrait: Portrait) => void;
  onSetDefaultPortrait: (portraitId: string) => void;
  onDeletePortrait: (portraitId: string) => void;
  onAddPortrait: () => void;
  /**
   * 拖拽排序：把 `fromPortraitId` 放到 `toPortraitId` 的前面 / 后面。
   *
   * <p>顺序更新与持久化由父组件负责：这里只报告"谁拖到了哪里"，
   * 失败回滚和提示也在父组件（需要拿得到保存前的顺序快照）。
   */
  onReorderPortrait: (
    fromPortraitId: string,
    toPortraitId: string,
    position: PortraitDropPosition,
  ) => void;
  /** 正在保存拖拽后的顺序：禁止再次拖动 / 保存，避免请求乱序 */
  reordering: boolean;
  /** 角色保存请求进行中：同样禁止拖动，避免保存与排序两个请求互相覆盖 */
  saving: boolean;
  /** 把默认立绘以外的所有立绘，裁剪都按默认立绘的比例套用 */
  onApplyDefaultCropToAll: () => void;
  /** 一次选多张图批量导入立绘 */
  onBatchImportPortraits: () => void;
  /** 有可用的默认立绘裁剪、且有其它立绘时才允许「与默认立绘裁剪一致」 */
  canApplyDefaultCrop: boolean;
  batchProgress: PortraitBatchProgress | null;
  batchMessage: PortraitBatchMessage | null;
  onDismissBatchMessage: () => void;
  /**
   * 各立绘的缩略图代次（立绘ID → 代次）。
   *
   * <p>缩略图文件名固定（`thumbnail_{portraitId}.png`），裁剪 / 换图后后端只覆盖内容、
   * 不改路径。改过的那张立绘代次 +1，卡片据此拼新的 `?t=` 重新取图；
   * 没改的立绘代次不变，不会跟着重新下载。
   */
  thumbnailVersions: { [portraitId: string]: number };

  // ---- 多选模式 ----
  /** 是否处于多选模式（卡片上出现勾选框，标题行下方出现批量操作条） */
  selectionMode: boolean;
  /** 已勾选的立绘 ID（渲染勾选框用；数量以 selectionCount 为准） */
  selectedPortraitIds: ReadonlySet<string>;
  /** 已勾选且仍在列表里的立绘数量 */
  selectionCount: number;
  /** 已勾选、去掉默认立绘之后需要套用裁剪的数量（按钮上显示） */
  selectedCropCount: number;
  /** 列表里的立绘是否已全部选中（全选框的 checked） */
  allPortraitsSelected: boolean;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onToggleSelectPortrait: (portraitId: string) => void;
  onToggleSelectAll: () => void;
  /** 把**选中的**立绘的裁剪改成默认立绘的裁剪 */
  onApplyDefaultCropToSelected: () => void;
  /** 删除**选中的**立绘（带二次确认） */
  onBatchDeleteSelected: () => void;
  /** 「沿用默认立绘裁剪」当前是否可用（没默认立绘 / 只选了默认立绘时为 false） */
  canApplySelectedCrop: boolean;
  /** 「沿用默认立绘裁剪」不可用的原因（挂在 title 上，不用点就知道为什么置灰） */
  selectedCropDisabledReason: string | null;
  /** 「删除」不可用的原因（没勾选任何立绘） */
  batchDeleteDisabledReason: string | null;
}

const BATCH_PROGRESS_LABEL: { [key in PortraitBatchProgress["kind"]]: string } =
  {
    crop: "正在应用裁剪",
    import: "正在导入立绘",
    delete: "正在删除立绘",
  };

/**
 * @component 立绘列表（角色详情弹窗内）
 *
 * <p>两种状态：
 * <ol>
 *   <li>普通状态：每张卡片带「编辑 / 设为默认 / 删除」单张操作，卡片可拖拽排序；</li>
 *   <li>多选状态（点标题行「批量选择」进入）：卡片左上角出现勾选框、单张操作收起，
 *       标题行下方出现批量操作条 —— 全选 / 已选数量 / 沿用默认立绘裁剪 / 删除 / 取消。</li>
 * </ol>
 *
 * <p>多选状态只是**入口**：勾选集合与批量动作都由 `CharacterDetailModal` 持有，
 * 因为批量操作失败后要"只保留失败项"、成功后要退出多选，这些都需要和批量执行结果一起处理。
 *
 * <p>排序与默认立绘解耦：列表按数据里的顺序渲染（后端 `display_order`），
 * 默认立绘可以位于任意位置，拖拽也不受它的标记影响。
 */
const PortraitsSection: React.FC<PortraitsSectionProps> = ({
  character,
  onEditPortrait,
  onSetDefaultPortrait,
  onDeletePortrait,
  onAddPortrait,
  onReorderPortrait,
  reordering,
  saving,
  onApplyDefaultCropToAll,
  onBatchImportPortraits,
  canApplyDefaultCrop,
  batchProgress,
  batchMessage,
  onDismissBatchMessage,
  thumbnailVersions,
  selectionMode,
  selectedPortraitIds,
  selectionCount,
  selectedCropCount,
  allPortraitsSelected,
  onEnterSelectionMode,
  onExitSelectionMode,
  onToggleSelectPortrait,
  onToggleSelectAll,
  onApplyDefaultCropToSelected,
  onBatchDeleteSelected,
  canApplySelectedCrop,
  selectedCropDisabledReason,
  batchDeleteDisabledReason,
}) => {
  const isDefaultPortrait = (portraitId: string) =>
    isDefaultPortraitId(character.portraits, portraitId);

  /**
   * 列表的渲染顺序 = 数据里的顺序（后端 `display_order` / 用户拖拽结果）。
   *
   * <p>**不再**按"默认立绘在前"重排：默认立绘可以位于任意位置，
   * 否则用户刚拖好的顺序会被立即改回去。卡片按 portraitID 做 key，
   * 挪位置不会重建组件，默认角标也会跟着卡片走。
   */
  const portraits = character.portraits ?? [];

  const isBusy = batchProgress !== null;

  // ---- 拖拽排序 ----
  // 多选模式 / 批量操作 / 正在保存顺序 / 角色保存中时不接受拖动，避免"点卡片 = 勾选"
  // 与拖拽打架，也避免两个会写 display_order 的请求互相覆盖。
  // 只有一张立绘时拖拽没有意义，也不显示手柄。
  const dragEnabled =
    portraits.length > 1 &&
    !selectionMode &&
    !isBusy &&
    !reordering &&
    !saving;
  // 被拖动的卡片（渲染占位 / 浮起效果用）
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 当前悬停的落点（目标卡片 + 前/后），渲染插入位置提示
  const [dropTarget, setDropTarget] = useState<{
    portraitId: string;
    position: PortraitDropPosition;
  } | null>(null);
  // 拖拽逻辑用 ref 读：drop / dragover 是连续事件，不依赖 React 状态是否已刷新
  const draggingIdRef = useRef<string | null>(null);

  /** 按指针在目标卡片左/右半边，决定放到它前面还是后面 */
  const computeDropPosition = (
    event: React.DragEvent<HTMLElement>,
  ): PortraitDropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  };

  const clearDragState = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => {
    if (!dragEnabled) {
      event.preventDefault();
      return;
    }

    // 卡片里的按钮 / 勾选框不该触发拖动：点在它们上面时按普通点击处理
    const eventTarget = event.target as HTMLElement | null;
    if (eventTarget?.closest("button, input, a, label, textarea, select")) {
      event.preventDefault();
      return;
    }

    draggingIdRef.current = portrait.portraitID;
    setDraggingId(portrait.portraitID);
    setDropTarget(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        // 兼容只读 dataTransfer 的环境；真正排序用的是 draggingIdRef
        event.dataTransfer.setData("text/plain", portrait.portraitID);
      } catch {
        // 忽略：部分浏览器 / 测试环境不允许写 dataTransfer
      }
    }
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => {
    const sourceId = draggingIdRef.current;
    if (!dragEnabled || !sourceId) {
      return;
    }
    // 只有 preventDefault 之后这里才是合法落点
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    if (sourceId === portrait.portraitID) {
      setDropTarget(null);
      return;
    }

    const position = computeDropPosition(event);
    setDropTarget((prev) =>
      prev?.portraitId === portrait.portraitID && prev.position === position
        ? prev
        : { portraitId: portrait.portraitID, position },
    );
  };

  const handleDragLeave = (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => {
    // 在卡片内部从缩略图移到文字区也会触发 dragleave：指针还在卡片里就不清提示
    const relatedTarget = event.relatedTarget as Node | null;
    if (
      relatedTarget &&
      typeof Node !== "undefined" &&
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }
    setDropTarget((prev) =>
      prev?.portraitId === portrait.portraitID ? null : prev,
    );
  };

  const handleDrop = (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => {
    // 即使当前不允许拖动也拦掉默认行为（否则浏览器可能把拖入的内容当导航）
    event.preventDefault();
    if (!dragEnabled) {
      return;
    }

    const sourceId =
      draggingIdRef.current ||
      (event.dataTransfer?.getData("text/plain") ?? null);
    const position = computeDropPosition(event);
    clearDragState();

    if (!sourceId || sourceId === portrait.portraitID) {
      return;
    }
    onReorderPortrait(sourceId, portrait.portraitID, position);
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const progressText = batchProgress
    ? `${BATCH_PROGRESS_LABEL[batchProgress.kind]} ${
        Math.min(batchProgress.done + 1, batchProgress.total)
      }/${batchProgress.total}…`
    : "";

  // 全选框的「半选」状态：原生 checkbox 只能靠 indeterminate 表达"选了一部分"
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectionCount > 0 && !allPortraitsSelected;
    }
  }, [selectionCount, allPortraitsSelected]);

  /**
   * 批量操作的进度 / 结果提示。
   *
   * <p>多选时它和操作栏一起放进吸顶容器：滚动到列表深处也能看到"正在处理第几张"，
   * 不会只剩一排置灰的按钮；不在多选模式时（「与默认立绘裁剪一致」「批量导入立绘」）
   * 仍然待在列表上方的正常文档流里。
   */
  const statusNode = isBusy ? (
    <div className="batch-status batch-status--busy" role="status">
      <span className="batch-status-spinner" />
      <span className="batch-status-text">{progressText}</span>
    </div>
  ) : batchMessage ? (
    <div
      className={`batch-status batch-status--${batchMessage.kind}`}
      role="status"
    >
      <span className="batch-status-text">{batchMessage.text}</span>
      <button
        type="button"
        className="batch-status-close"
        onClick={onDismissBatchMessage}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  ) : null;

  return (
    <div className="portraits-section">
      <div className="section-header">
        <div className="portraits-heading">
          <h3>立绘列表</h3>
          {portraits.length > 1 && !selectionMode && (
            <span className="portraits-drag-hint">
              {saving
                ? "正在保存…"
                : reordering
                  ? "正在保存顺序…"
                  : "拖动卡片可调整顺序"}
            </span>
          )}
        </div>
        <div className="section-actions">
          <button
            className="btn-secondary"
            onClick={onApplyDefaultCropToAll}
            disabled={isBusy || !canApplyDefaultCrop}
            title={
              canApplyDefaultCrop
                ? "把默认立绘以外的立绘，裁剪框都按默认立绘的比例套用（原图尺寸不同也能保持同样的头部比例）"
                : "没有需要修改的立绘：角色还没有默认立绘、默认立绘还没框好头部，或没有其它立绘"
            }
          >
            与默认立绘裁剪一致
          </button>
          <button
            className="btn-secondary"
            onClick={onBatchImportPortraits}
            disabled={isBusy}
            title="一次选多张立绘图片导入；若已有默认立绘，导入的立绘会按比例套用默认立绘的裁剪"
          >
            批量导入立绘
          </button>
          {/* 「批量选择」紧挨在「批量导入立绘」右侧：两个都是"对多张立绘做事"的入口 */}
          <button
            className={`btn-secondary${
              selectionMode ? " is-active" : ""
            }`}
            onClick={selectionMode ? onExitSelectionMode : onEnterSelectionMode}
            disabled={isBusy}
            aria-pressed={selectionMode}
            title={
              selectionMode
                ? "退出多选模式（已勾选的立绘会全部取消）"
                : "进入多选模式：勾选多张立绘后，可以批量沿用默认立绘的裁剪或批量删除"
            }
          >
            {selectionMode ? "退出多选" : "批量选择"}
          </button>
          <button
            className="btn-primary"
            onClick={onAddPortrait}
            disabled={isBusy}
          >
            添加立绘
          </button>
        </div>
      </div>

      {(selectionMode || statusNode) && (
        /*
         * 批量操作区：吸顶容器里放操作条和进度/结果提示。
         *
         * 立绘一多，列表要滚好几屏；操作条如果跟着滚走，用户就得来回上下翻
         * 才能改勾选 / 看"处理到第几张"。吸顶后它一直停在弹窗内容区顶部。
         * 只显示结果提示时（不在多选模式）也挂在这里：批量操作一结束就会退出
         * 多选，提示如果留在文档流里，滚到列表深处的用户根本看不到。
         */
        <div className="portrait-selection-dock">
          {selectionMode && (
            <div
              className="portrait-selection-bar"
              role="group"
              aria-label="批量选择立绘"
            >
              <label className="portrait-select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allPortraitsSelected}
                  onChange={onToggleSelectAll}
                  disabled={isBusy || portraits.length === 0}
                />
                全选
              </label>
              <span className="portrait-selection-count" role="status">
                已选 {selectionCount} / {portraits.length} 张
              </span>
              <div className="portrait-selection-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onApplyDefaultCropToSelected}
                  disabled={isBusy || !canApplySelectedCrop}
                  title={
                    selectedCropDisabledReason ??
                    "把选中的立绘的裁剪改成默认立绘的比例（默认立绘本身跳过）"
                  }
                >
                  沿用默认立绘裁剪
                  {selectedCropCount > 0 ? ` (${selectedCropCount})` : ""}
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={onBatchDeleteSelected}
                  disabled={isBusy || !!batchDeleteDisabledReason}
                  title={
                    batchDeleteDisabledReason ??
                    "删除选中的立绘（不可恢复，会先确认）"
                  }
                >
                  删除{selectionCount > 0 ? ` (${selectionCount})` : ""}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onExitSelectionMode}
                  disabled={isBusy}
                  title="退出多选模式（已勾选的立绘会全部取消）"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {statusNode}
        </div>
      )}

      <div className="portraits-grid">
        {portraits.map((portrait) => (
          <PortraitCard
            key={portrait.portraitID}
            portrait={portrait}
            characterId={character.characterID}
            isDefault={isDefaultPortrait(portrait.portraitID)}
            thumbnailVersion={thumbnailVersions[portrait.portraitID] ?? 0}
            onEdit={onEditPortrait}
            onSetDefault={onSetDefaultPortrait}
            onDelete={onDeletePortrait}
            selectable={selectionMode}
            selected={selectedPortraitIds.has(portrait.portraitID)}
            selectionDisabled={isBusy}
            onToggleSelect={onToggleSelectPortrait}
            draggable={dragEnabled}
            dragging={draggingId === portrait.portraitID}
            dropPosition={
              dropTarget?.portraitId === portrait.portraitID
                ? dropTarget.position
                : null
            }
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
};

export default PortraitsSection;
