import React from "react";
import { MyCharacter, Portrait } from "@types";
import PortraitCard from "./PortraitCard";
import { isDefaultPortraitId } from "@features/common/utils/portraitUtils";

/** 立绘批量操作进度（批量套用裁剪 / 批量导入） */
export interface PortraitBatchProgress {
  kind: "crop" | "import";
  done: number;
  total: number;
}

/** 立绘批量操作结果提示 */
export interface PortraitBatchMessage {
  kind: "success" | "error" | "info";
  text: string;
}

interface PortraitsSectionProps {
  character: MyCharacter;
  onEditPortrait: (portrait: Portrait) => void;
  onSetDefaultPortrait: (portraitId: string) => void;
  onDeletePortrait: (portraitId: string) => void;
  onAddPortrait: () => void;
  /** 把默认立绘以外的所有立绘，裁剪都按默认立绘的比例套用 */
  onApplyDefaultCropToAll: () => void;
  /** 一次选多张图批量导入立绘 */
  onBatchImportPortraits: () => void;
  /** 有可用的默认立绘裁剪、且有其它立绘时才允许「与默认立绘裁剪一致」 */
  canApplyDefaultCrop: boolean;
  batchProgress: PortraitBatchProgress | null;
  batchMessage: PortraitBatchMessage | null;
  onDismissBatchMessage: () => void;
  /** 缩略图版本号：批量重生成缩略图后 +1，让卡片重新取图 */
  thumbnailVersion: number;
}

const BATCH_PROGRESS_LABEL: { [key in PortraitBatchProgress["kind"]]: string } =
  {
    crop: "正在应用裁剪",
    import: "正在导入立绘",
  };

const PortraitsSection: React.FC<PortraitsSectionProps> = ({
  character,
  onEditPortrait,
  onSetDefaultPortrait,
  onDeletePortrait,
  onAddPortrait,
  onApplyDefaultCropToAll,
  onBatchImportPortraits,
  canApplyDefaultCrop,
  batchProgress,
  batchMessage,
  onDismissBatchMessage,
  thumbnailVersion,
}) => {
  const isDefaultPortrait = (portraitId: string) =>
    isDefaultPortraitId(character.portraits, portraitId);

  const isBusy = batchProgress !== null;
  const progressText = batchProgress
    ? `${BATCH_PROGRESS_LABEL[batchProgress.kind]} ${
        Math.min(batchProgress.done + 1, batchProgress.total)
      }/${batchProgress.total}…`
    : "";

  return (
    <div className="portraits-section">
      <div className="section-header">
        <h3>立绘列表</h3>
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
          <button
            className="btn-primary"
            onClick={onAddPortrait}
            disabled={isBusy}
          >
            添加立绘
          </button>
        </div>
      </div>

      {isBusy && (
        <div className="batch-status batch-status--busy" role="status">
          <span className="batch-status-spinner" />
          {progressText}
        </div>
      )}

      {!isBusy && batchMessage && (
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
      )}

      <div className="portraits-grid">
        {character.portraits?.map((portrait) => (
          <PortraitCard
            key={portrait.portraitID}
            portrait={portrait}
            characterId={character.characterID}
            isDefault={isDefaultPortrait(portrait.portraitID)}
            thumbnailVersion={thumbnailVersion}
            onEdit={onEditPortrait}
            onSetDefault={onSetDefaultPortrait}
            onDelete={onDeletePortrait}
          />
        ))}
      </div>
    </div>
  );
};

export default PortraitsSection;
