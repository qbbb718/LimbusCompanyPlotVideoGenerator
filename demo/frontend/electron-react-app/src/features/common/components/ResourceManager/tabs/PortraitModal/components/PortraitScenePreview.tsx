import React, { useCallback, useEffect, useRef, useState } from "react";
import { Background } from "@types";
import ApiService from "@services/ApiService";
import createLogger from "../utils/logger";
import "./PortraitScenePreview.css";

const log = createLogger("PortraitScenePreview");

interface PortraitScenePreviewProps {
  /** 已有立绘的相对路径（新立绘还没上传时为空） */
  imagePath: string;
  /** 新选择、尚未上传的立绘文件；优先级高于 imagePath */
  imageFile?: File | null;
  /** 当前裁剪框左上角 X（原图像素） */
  faceX: number;
  /** 当前裁剪框左上角 Y（原图像素） */
  faceY: number;
  /** 当前裁剪框边长（原图像素） */
  length: number;
  /** 立绘手动偏移 X */
  adjX: number;
  /** 立绘手动偏移 Y */
  adjY: number;
  /** 角色身高（cm），决定立绘在画面里的纵向位置 */
  characterHeight: number;
  onClose: () => void;
}

/**
 * @component 立绘场景预览
 *
 * <p>「资源管理 → 角色 → 编辑立绘」里点「预览」后弹出：把当前裁剪框（可能还没保存）
 * 交给后端渲染成一张与视频构图一致的画面 —— 背景 + 立绘 + 边框 + 界面 UI，
 * 不渲染台词和角色名片。
 *
 * <p>背景可在弹窗底部的下拉框里切换；切一次向后端重新要一张图。
 * 立绘原图有两种来源：已有立绘只传路径（不重复上传），新立绘直接传 File
 * （避免预览动作提前把文件写进角色素材目录）。
 */
const PortraitScenePreview: React.FC<PortraitScenePreviewProps> = ({
  imagePath,
  imageFile,
  faceX,
  faceY,
  length,
  adjX,
  adjY,
  characterHeight,
  onClose,
}) => {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [backgroundId, setBackgroundId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当前图片的 blob URL，切换背景/卸载时要主动释放，避免内存泄漏
  const blobUrlRef = useRef<string | null>(null);
  // 请求序号：快速切换背景时只认最后一次请求的结果，避免旧图覆盖新图
  const requestIdRef = useRef(0);

  // 关闭时释放 blob URL
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Esc 关闭预览
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 拉取背景列表：默认用第一张背景，用户可在底部下拉框里换
  useEffect(() => {
    let cancelled = false;

    const loadBackgrounds = async () => {
      try {
        const list: Background[] = await ApiService.getBackgrounds();
        if (cancelled) return;

        // 只保留真正有图片路径的背景（新建但还没上传文件的背景无法渲染）
        const usable = (list || []).filter((bg) => bg && bg.uuid && bg.path);
        setBackgrounds(usable);
        if (usable.length > 0) {
          setBackgroundId(usable[0].uuid);
        } else {
          setError("没有可用的背景图，请先在资源管理的「背景」页添加至少一张背景。");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[PortraitScenePreview] 加载背景列表失败", err);
          setError("加载背景列表失败，请检查后端是否正常运行。");
        }
      }
    };

    loadBackgrounds();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderPreview = useCallback(
    async (background: Background) => {
      if (!background) return;

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const formData = new FormData();
        if (imageFile && imageFile.size > 0) {
          formData.append("file", imageFile, imageFile.name || "portrait.png");
        } else if (imagePath) {
          formData.append("imagePath", imagePath);
        } else {
          throw new Error("请先选择立绘文件");
        }

        formData.append("faceX", String(Math.max(0, Math.round(faceX || 0))));
        formData.append("faceY", String(Math.max(0, Math.round(faceY || 0))));
        formData.append("length", String(Math.max(0, Math.round(length || 0))));
        formData.append("adjX", String(Math.round(adjX || 0)));
        formData.append("adjY", String(Math.round(adjY || 0)));
        formData.append("height", String(characterHeight || 0));
        formData.append("backgroundId", background.uuid);

        log("请求立绘预览", {
          background: background.name,
          hasFile: !!(imageFile && imageFile.size > 0),
          imagePath,
          faceX,
          faceY,
          length,
          adjX,
          adjY,
          characterHeight,
        });

        const url = await ApiService.getPortraitPreview(formData);

        // 已经切到别的背景/关闭弹窗：把这张迟到的图丢掉
        if (requestId !== requestIdRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        const message = await describePreviewError(err);
        console.error("[PortraitScenePreview] 渲染预览失败", err);
        setPreviewUrl(null);
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      imageFile,
      imagePath,
      faceX,
      faceY,
      length,
      adjX,
      adjY,
      characterHeight,
    ],
  );

  // 当前背景确定后（含切换）渲染一次
  useEffect(() => {
    if (!backgroundId) return;
    const background = backgrounds.find((bg) => bg.uuid === backgroundId);
    if (background) {
      renderPreview(background);
    }
  }, [backgroundId, backgrounds, renderPreview]);

  const hasImage = !!previewUrl;

  return (
    <div className="portrait-scene-preview-overlay" onClick={onClose}>
      <div
        className="portrait-scene-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portrait-scene-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="portrait-scene-preview-header">
          <h3 id="portrait-scene-preview-title">立绘预览</h3>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="关闭立绘预览"
          >
            ×
          </button>
        </div>

        <div className="portrait-scene-preview-stage">
          {hasImage && (
            <img src={previewUrl!} alt="立绘在画面中的预览效果" />
          )}

          {!hasImage && (isLoading || error) && (
            <div
              className={`portrait-scene-preview-status ${
                error ? "is-error" : ""
              }`}
            >
              {isLoading && <div className="portrait-scene-preview-spinner" />}
              <span>{error || "正在渲染预览..."}</span>
            </div>
          )}

          {hasImage && isLoading && (
            <div className="portrait-scene-preview-status is-overlay">
              <div className="portrait-scene-preview-spinner" />
              <span>正在渲染预览...</span>
            </div>
          )}
        </div>

        <div className="portrait-scene-preview-footer">
          <label htmlFor="portrait-preview-background">背景</label>
          <select
            id="portrait-preview-background"
            value={backgroundId}
            onChange={(event) => setBackgroundId(event.target.value)}
            disabled={backgrounds.length === 0 || isLoading}
          >
            {backgrounds.length === 0 && <option value="">无可用背景</option>}
            {backgrounds.map((background) => (
              <option key={background.uuid} value={background.uuid}>
                {background.name || background.path}
              </option>
            ))}
          </select>
 
        </div>
      </div>
    </div>
  );
};

/**
 * 从 ApiService 抛出的错误里尽量取出后端给的中文提示。
 *
 * <p>预览接口是 blob 响应，出错时 axios 的 error.response.data 也是一个 Blob，
 * 直接 `String(error)` 只能得到 "Request failed with status code 500"，
 * 用户看不到真正原因（例如"没有可用的背景图"）。
 */
async function describePreviewError(error: unknown): Promise<string> {
  const fallback = "渲染预览失败，请检查后端是否正常运行。";

  const responseData = (error as any)?.response?.data;
  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.message) return `渲染预览失败：${parsed.message}`;
        } catch {
          // 不是 JSON，下面按纯文本处理
        }
        return `渲染预览失败：${text}`;
      }
    } catch {
      // 读不出 blob 时走通用提示
    }
  }

  const message =
    (error as any)?.response?.data?.message ||
    (typeof (error as any)?.response?.data === "string"
      ? (error as any).response.data
      : "") ||
    (error as any)?.message;
  return message ? `渲染预览失败：${message}` : fallback;
}

export default PortraitScenePreview;
