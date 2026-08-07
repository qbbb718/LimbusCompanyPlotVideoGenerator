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
  // 跟踪已在本会话中成功缓存过预览的 UUID。首次查看 dirty record 时强制刷新以
  // 重新生成缓存，之后（同一会话，未再次编辑）则直接使用磁盘缓存。
  const previewedRef = useRef<Set<string>>(new Set());
  // 记录上次渲染时 record 对应的 isDirty 状态，用于检测 record 是否在渲染后又被编辑
  const lastDirtyRef = useRef<Map<string, boolean>>(new Map());

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
        const wasDirty = lastDirtyRef.current.get(uuid);
        const alreadyPreviewed = previewedRef.current.has(uuid);

        // 决定是否强制刷新：
        // 1. 首次渲染该 record，且 record 标记为 dirty → 强制刷新以更新缓存
        // 2. record 在上次预览后又变回 dirty → 强制刷新（被编辑了）
        // 3. 其他情况 → 使用缓存
        const forceRefresh =
          currentlyDirty && (!alreadyPreviewed || wasDirty === false);

        const url = await ApiService.getRecordPreview(
          selectedRecord, videoWidth, videoHeight,
          forceRefresh,
        );

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        // 渲染成功后标记该 UUID 已缓存
        previewedRef.current.add(uuid);
        lastDirtyRef.current.set(uuid, currentlyDirty);

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
