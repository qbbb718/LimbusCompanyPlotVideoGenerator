import React, { useEffect, useState } from "react";
import "./RecordEditor.css";

/**
 * @component 视频导出成功弹窗
 * 视频生成完成后替代原来的 alert 弹窗，除保存路径与耗时外：
 * 1. 以加粗大字醒目提示"发布视频时请注明-所用美术素材来自月海伦娜与边狱巴士中文wiki"；
 * 2. 提供"打开输出文件夹"按钮，调用 Electron 主进程打开视频所在目录。
 *
 * 注意：提示文字与后端 ExportNoticeWriter.NOTICE_TEXT 保持一致（后端会在导出目录
 * 生成同名 txt 文件），修改文案时两处需同步。
 */
const ART_NOTICE_TEXT =
  "发布视频时请注明-所用美术素材来自月海伦娜与边狱巴士中文wiki";

interface ExportSuccessDialogProps {
  /** 后端返回的视频输出路径；多个分层导出时为逗号分隔的多个路径 */
  outputPath?: string;
  /** 导出耗时（毫秒） */
  elapsedMs?: number;
  /** 关闭弹窗 */
  onClose: () => void;
}

/**
 * @function 从视频输出路径推导导出文件夹
 * 多个分层导出的文件都写在同一目录，因此取第一个路径即可。
 * @param outputPath 后端返回的输出路径（可能包含多个逗号分隔的路径）
 * @return 导出文件夹路径；无法解析时返回空字符串
 */
const resolveExportFolder = (outputPath?: string): string => {
  if (!outputPath) return "";
  const first = outputPath.split(",")[0].trim().replace(/^["']|["']$/g, "");
  if (!first) return "";

  // 统一分隔符后再截取最后一段，兼容 Windows 反斜杠与前端可能出现的正斜杠
  const normalized = first.replace(/\//g, "\\");
  const lastSep = normalized.lastIndexOf("\\");
  if (lastSep < 0) {
    // 没有分隔符：传入的本身就是目录（相对目录等）
    return normalized;
  }
  // "C:\video.mp4" 这类根目录下的文件，截取后要补回盘符的反斜杠
  if (/^[a-zA-Z]:$/.test(normalized.slice(0, lastSep))) {
    return normalized.slice(0, lastSep + 1);
  }
  return normalized.slice(0, lastSep);
};

const ExportSuccessDialog: React.FC<ExportSuccessDialogProps> = ({
  outputPath,
  elapsedMs,
  onClose,
}) => {
  // 打开文件夹失败时的提示（成功或未点击时为空）
  const [openFolderError, setOpenFolderError] = useState("");

  // Esc 关闭弹窗，符合一般弹窗习惯
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /**
   * @function 打开视频导出文件夹
   * 非 Electron 环境（浏览器调试）没有该能力，此时退化为提示用户手动打开。
   */
  const handleOpenFolder = async () => {
    const folder = resolveExportFolder(outputPath);
    if (!folder) {
      setOpenFolderError("未获取到导出目录，请按上方保存路径手动打开。");
      return;
    }

    const api = window.electronAPI;
    if (!api || !api.openFolder) {
      setOpenFolderError(`当前环境不支持自动打开文件夹，请手动打开：${folder}`);
      return;
    }

    try {
      const result = await api.openFolder(folder);
      if (result && result.success) {
        setOpenFolderError("");
      } else {
        setOpenFolderError(
          `无法打开文件夹：${(result && result.error) || "未知错误"}（${folder}）`,
        );
      }
    } catch (err: any) {
      setOpenFolderError(`打开文件夹失败：${err?.message || err}（${folder}）`);
    }
  };

  return (
    <div className="export-success-overlay" onClick={onClose}>
      <div
        className="export-success-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="export-success-title">视频生成成功！</h3>

        <div className="export-success-meta">
          <div className="export-success-meta-row">
            <span className="export-success-meta-label">保存路径</span>
            <span className="export-success-meta-value">
              {outputPath || "（后端未返回路径）"}
            </span>
          </div>
          <div className="export-success-meta-row">
            <span className="export-success-meta-label">耗时</span>
            <span className="export-success-meta-value">
              {((elapsedMs || 0) / 1000).toFixed(1)} 秒
            </span>
          </div>
        </div>

        {/* 素材来源提示：加粗加大，便于用户直接复制到视频简介 */}
        <div className="export-success-notice">{ART_NOTICE_TEXT}</div>

        <div className="export-success-hint">
          已在导出文件夹生成同名 txt 文件，发布视频时可直接复制使用。
        </div>

        {openFolderError && (
          <div className="export-success-error">{openFolderError}</div>
        )}

        <div className="export-success-actions">
          <button onClick={handleOpenFolder}>打开输出文件夹</button>
          <button className="primary-btn" onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSuccessDialog;
