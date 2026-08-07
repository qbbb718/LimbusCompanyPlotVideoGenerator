import React, { useState, useEffect, useRef } from "react";
import { Record } from "@types";
import ApiService from "@services/ApiService";
import "./RecordEditor.css";

interface RecordPreviewProps {
  selectedRecord: Record;
  videoWidth: number;
  videoHeight: number;
}

const RecordPreview: React.FC<RecordPreviewProps> = ({ selectedRecord, videoWidth, videoHeight }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // 记录上次成功渲染时的视觉内容摘要。当 record 内容变化（编辑角色/背景/说话人等）
  // 时摘要不匹配，即使 isDirty 保持 true 未翻转，也能正确触发 forceRefresh。
  const lastVisualHashRef = useRef<Map<string, string>>(new Map());

  /** 提取影响预览图渲染的视觉属性摘要 */
  const visualHash = (r: Record): string =>
    JSON.stringify({
      chars: r.chars,
      bg: r.bg,
      tempImages: r.tempImages,
      audioCommands: r.audioCommands,
      effects: r.effects,
      dialogue: {
        text: r.dialogue?.text,
        speakerC: r.dialogue?.speakerC,
        speakerName: r.dialogue?.speakerName,
        faction: r.dialogue?.faction,
        align: r.dialogue?.align,
        emotion: r.dialogue?.emotion,
        location: r.dialogue?.location,
      },
    });

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!selectedRecord) return;

      setIsLoading(true);
      setError(null);

      try {
        // 清理之前的 blob URL
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }

        const uuid = selectedRecord.uuid;
        const currentlyDirty = selectedRecord.isDirty === true;
        const lastHash = lastVisualHashRef.current.get(uuid);
        const currentHash = visualHash(selectedRecord);

        // 决定是否强制刷新：
        // 1. record 是 dirty 且首次渲染（lastHash 不存在）→ 强制刷新
        // 2. record 是 dirty 且视觉内容自上次渲染后已变化 → 强制刷新
        // 3. record 是 clean 或内容未变 → 使用磁盘缓存
        const forceRefresh = currentlyDirty && lastHash !== currentHash;

        const url = await ApiService.getRecordPreview(
          selectedRecord, videoWidth, videoHeight,
          forceRefresh,
        );

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        // 渲染成功后记录本次视觉摘要
        lastVisualHashRef.current.set(uuid, currentHash);

        blobUrlRef.current = url;
        setPreviewUrl(url);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("渲染预览图失败:", err);
          setError("预览图渲染失败，请检查后端是否正常运行");
          setPreviewUrl(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedRecord, videoWidth, videoHeight]);

  // 组件卸载时清理 blob URL
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="preview-container">
      <div className="preview-image">
        {isLoading && (
          <div className="preview-status">
            <div className="preview-spinner" />
            <span>渲染预览中...</span>
          </div>
        )}
        {!isLoading && error && (
          <div className="preview-status preview-error">
            <span>{error}</span>
          </div>
        )}
        {!isLoading && !error && previewUrl && (
          <img
            src={previewUrl}
            alt="记录预览图"
            className="preview-render"
          />
        )}
        {!isLoading && !error && !previewUrl && (
          <div className="preview-placeholder">预览图区域</div>
        )}
      </div>
      <div className="preview-timeline">
        <div className="timeline-placeholder">时间轴</div>
      </div>
    </div>
  );
};

export default RecordPreview;
