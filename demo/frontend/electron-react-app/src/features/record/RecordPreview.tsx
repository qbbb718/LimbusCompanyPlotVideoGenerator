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

        const url = await ApiService.getRecordPreview(selectedRecord, videoWidth, videoHeight);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
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
