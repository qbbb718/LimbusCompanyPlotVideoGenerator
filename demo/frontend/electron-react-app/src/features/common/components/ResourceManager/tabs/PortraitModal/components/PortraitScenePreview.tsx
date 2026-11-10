import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, MyCharacter, Portrait } from "@types";
import ApiService from "@services/ApiService";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
} from "@features/common/utils/portraitUtils";
import { getEmotionLabel } from "@features/common/utils/emotionMapper";
import createLogger from "../utils/logger";
import PortraitComparePicker from "./PortraitComparePicker";
import "./PortraitScenePreview.css";

const log = createLogger("PortraitScenePreview");

/** 最多同时放几个对比角色：左、右各一个，画面才排得开 */
const MAX_COMPARE_PORTRAITS = 2;

/** 对比角色与当前立绘的水平间距（占画面宽度的百分比） */
const DEFAULT_COMPARE_SPACING_PERCENT = 24;
/** 最小 12%：低于这个值两侧的头部方框会叠在一起，反而看不清 */
const MIN_COMPARE_SPACING_PERCENT = 12;
/** 最大 36%：再往外角色会被 80% 场景的右边缘裁掉（画面里只剩半个人） */
const MAX_COMPARE_SPACING_PERCENT = 36;

/**
 * 预览按 1080p 设计画布渲染（与后端 ProjectConfig.VIDEO_WIDTH 一致），
 * 对比角色的水平偏移 adjX 的单位就是设计画布像素。
 */
const DESIGN_CANVAS_WIDTH = 1920;

/** 百分比间距 → 后端认识的 adjX（设计画布像素） */
const spacingPercentToOffset = (percent: number): number =>
  Math.round((percent / 100) * DESIGN_CANVAS_WIDTH);

type CompareSide = "left" | "right";

/** 一个已经加进画面里的对比角色 */
interface CompareItem {
  character: MyCharacter;
  portrait: Portrait;
  /** 站在当前立绘的哪一侧：第一个加进来的在右，第二个在左 */
  side: CompareSide;
}

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
  /**
   * 当前正在编辑的角色 / 立绘。
   *
   * 只用于「添加对比角色」：默认挑别的角色，并把这正在调的这一张从可选列表里藏掉
   * （拿自己和自己比没有意义）。
   */
  currentCharacterId?: string;
  currentPortraitId?: string | null;
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
 *
 * <p>底部还能<b>添加对比角色</b>：从素材库里挑 1~2 张别的立绘，它们和后端成片一样
 * 按各自的身高 + 裁剪框缩放，一左一右站在当前立绘旁边。头框在画面里恒为 183 像素，
 * 所以"这个角色的头是不是比别人的大 / 小、站位是不是偏高"一眼就能看出来。
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
  currentCharacterId,
  currentPortraitId,
  onClose,
}) => {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [backgroundId, setBackgroundId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- 对比角色 ----
  const [compareItems, setCompareItems] = useState<CompareItem[]>([]);
  /** 间距的实时值（拖动滑杆时只改它，松手才真正重新渲染，避免一路狂发请求） */
  const [spacingPercent, setSpacingPercent] = useState(
    DEFAULT_COMPARE_SPACING_PERCENT,
  );
  /** 已经提交的间距：渲染请求只用它 */
  const [committedSpacingPercent, setCommittedSpacingPercent] = useState(
    DEFAULT_COMPARE_SPACING_PERCENT,
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  /** 素材库角色列表：null = 还没拉过（第一次打开选择器时才拉，不拖慢预览本身） */
  const [characters, setCharacters] = useState<MyCharacter[] | null>(null);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);

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

  // Esc 关闭预览（选择器打开时只收起选择器，不把整个预览关掉）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isPickerOpen) {
        setIsPickerOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isPickerOpen]);

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

  // ---- 对比角色：素材库角色列表（第一次打开选择器时才拉） ----
  const loadCharacters = useCallback(async () => {
    setCharactersError(null);
    setIsLoadingCharacters(true);
    try {
      const list = (await ApiService.getCharacters()) as MyCharacter[];
      setCharacters(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("[PortraitScenePreview] 加载角色列表失败", err);
      setCharactersError("加载角色列表失败，请检查后端是否正常运行。");
      // 保持 null：下次打开选择器会自然重试
      setCharacters(null);
    } finally {
      setIsLoadingCharacters(false);
    }
  }, []);

  const openComparePicker = () => {
    setIsPickerOpen(true);
    if (!characters && !isLoadingCharacters) {
      void loadCharacters();
    }
  };

  const addCompare = useCallback((character: MyCharacter, portrait: Portrait) => {
    setCompareItems((current) => {
      if (current.length >= MAX_COMPARE_PORTRAITS) return current;
      if (
        current.some((item) => item.portrait.portraitID === portrait.portraitID)
      ) {
        return current;
      }
      const side: CompareSide = current.some((item) => item.side === "right")
        ? "left"
        : "right";
      return [...current, { character, portrait, side }];
    });
    // 选完就收起选择器，让用户立刻看到新的对比图
    setIsPickerOpen(false);
  }, []);

  const removeCompare = useCallback((portraitId: string) => {
    setCompareItems((current) =>
      current.filter((item) => item.portrait.portraitID !== portraitId),
    );
  }, []);

  const addedPortraitIds = useMemo(
    () => compareItems.map((item) => item.portrait.portraitID),
    [compareItems],
  );

  /**
   * 已提交的对比间距（设计画布像素）。
   *
   * 滑杆拖动过程中只改显示值，松手（pointerup / keyup / blur）才写进这里，
   * 因而一次拖动最多只向后端要多一张图。
   */
  const compareOffset = spacingPercentToOffset(committedSpacingPercent);

  const commitSpacingPercent = useCallback((value: number) => {
    setCommittedSpacingPercent(value);
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

        // 对比角色：重复的 compare 字段，值是 "立绘ID:水平偏移"（设计画布像素，负数在左）
        compareItems.forEach((item) => {
          const offset = item.side === "right" ? compareOffset : -compareOffset;
          formData.append("compare", `${item.portrait.portraitID}:${offset}`);
        });

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
          compares: compareItems.map((item) => ({
            portraitId: item.portrait.portraitID,
            character: item.character.characterName,
            side: item.side,
          })),
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
      compareItems,
      compareOffset,
    ],
  );

  // 当前背景确定后（含切换）渲染一次；改动对比角色 / 间距也会走到这里
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
          <div className="portrait-scene-preview-row">
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

          <div className="portrait-scene-preview-row portrait-scene-preview-compares">
            <span className="portrait-scene-preview-label">对比角色</span>

            {compareItems.length === 0 && (
              <span className="portrait-scene-preview-empty">
                还没有添加对比角色
              </span>
            )}

            {compareItems.map((item) => (
              <span
                key={item.portrait.portraitID}
                className="portrait-compare-chip"
                title={`${item.character.characterName} · ${
                  item.portrait.portName || item.portrait.portraitID
                }（${item.side === "right" ? "右侧" : "左侧"}）`}
              >
                <img
                  src={
                    buildPortraitThumbnailUrl(item.portrait.thumbnailPath) ||
                    MISSING_THUMBNAIL_PLACEHOLDER
                  }
                  alt=""
                  onError={(event) => {
                    const image = event.currentTarget;
                    image.onerror = null;
                    image.src = MISSING_THUMBNAIL_PLACEHOLDER;
                  }}
                />
                <span className="portrait-compare-chip-text">
                  <span className="portrait-compare-chip-name">
                    {item.character.characterName}
                  </span>
                  <span className="portrait-compare-chip-meta">
                    {item.side === "right" ? "右侧" : "左侧"} ·{" "}
                    {getEmotionLabel(item.portrait.emotion)}
                  </span>
                </span>
                <button
                  type="button"
                  className="portrait-compare-chip-remove"
                  aria-label={`移除对比角色 ${item.character.characterName}`}
                  title="移除"
                  onClick={() => removeCompare(item.portrait.portraitID)}
                >
                  ×
                </button>
              </span>
            ))}

            <button
              type="button"
              className="portrait-scene-preview-add"
              onClick={openComparePicker}
              disabled={compareItems.length >= MAX_COMPARE_PORTRAITS}
              title={
                compareItems.length >= MAX_COMPARE_PORTRAITS
                  ? "最多同时对比 2 个角色：先移除一个再加"
                  : "从素材库里挑一个角色，站在旁边一起看裁剪效果"
              }
            >
              ＋ 添加对比角色
            </button>

            {compareItems.length > 0 && (
              <label className="portrait-scene-preview-spacing">
                <span>间距 {spacingPercent}%</span>
                <input
                  type="range"
                  min={MIN_COMPARE_SPACING_PERCENT}
                  max={MAX_COMPARE_SPACING_PERCENT}
                  step={1}
                  value={spacingPercent}
                  aria-label="对比角色间距"
                  onChange={(event) =>
                    setSpacingPercent(Number(event.target.value))
                  }
                  // 拖动过程中不发请求：松手 / 松键 / 失焦时才提交
                  onPointerUp={() => commitSpacingPercent(spacingPercent)}
                  onKeyUp={() => commitSpacingPercent(spacingPercent)}
                  onBlur={() => commitSpacingPercent(spacingPercent)}
                />
              </label>
            )}
          </div>

          {compareItems.length > 0 && (
            <p className="portrait-scene-preview-hint">
              对比角色按各自的身高与裁剪框缩放后站在两侧；各角色的头部裁剪框在画面里是同一大小，
              可以据此核对头的大小与站位。
            </p>
          )}
        </div>

        {isPickerOpen && (
          <PortraitComparePicker
            characters={characters}
            isLoading={isLoadingCharacters}
            loadError={charactersError}
            currentCharacterId={currentCharacterId}
            currentPortraitId={currentPortraitId}
            addedPortraitIds={addedPortraitIds}
            onAdd={addCompare}
            onRetry={() => void loadCharacters()}
            onClose={() => setIsPickerOpen(false)}
          />
        )}
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
