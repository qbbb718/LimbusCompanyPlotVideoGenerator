import React from "react";
import type {
  BatchMessage,
  BatchProgress,
} from "@features/common/utils/resourceTransfer";

interface ResourceBatchStatusProps {
  /** 正在处理时的进度；null = 没有进行中的批量操作 */
  progress: BatchProgress | null;
  /** 上一次批量操作的结果提示（结束后显示，关掉即消失） */
  message: BatchMessage | null;
  /** 进度文案的前半句，如「正在导入背景」「正在添加音频」 */
  label: string;
  /** 关掉结果提示 */
  onDismiss: () => void;
}

/**
 * @component 批量操作的进度 / 结果提示条（背景、音效两个页签共用）
 *
 * <p>背景 / 音效的「📥 导入」与「➕ 添加」都支持一次选多个文件，这条提示条同时服务两者：
 * 进行中显示"第几个 / 共几个、正在处理哪个文件"，结束后换成可关闭的结果提示。
 *
 * <p>为什么不再用 alert：用户需要**一直看得到**进度；失败清单也可能有好几条
 * （哪个文件、为什么），alert 里读不完；而且在 Electron 里 alert 一关掉就会抢走键盘焦点。
 */
const ResourceBatchStatus: React.FC<ResourceBatchStatusProps> = ({
  progress,
  message,
  label,
  onDismiss,
}) => {
  if (progress) {
    const current = Math.min(progress.done + 1, progress.total);
    return (
      <div
        className="resource-batch-status resource-batch-status--busy"
        role="status"
      >
        <span className="resource-batch-spinner" aria-hidden="true" />
        <span className="resource-batch-text">
          {`${label} ${current}/${progress.total}：${progress.fileName}…`}
        </span>
      </div>
    );
  }

  if (!message) return null;

  return (
    <div
      className={`resource-batch-status resource-batch-status--${message.kind}`}
      role="status"
    >
      <span className="resource-batch-text">{message.text}</span>
      <button
        type="button"
        className="resource-batch-close"
        onClick={onDismiss}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
};

export default ResourceBatchStatus;
