import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { CropperRef, Cropper } from "react-advanced-cropper";
import { Area } from "react-easy-crop";
import { Portrait } from "@types";
import createLogger from "../utils/logger";
import {
  PortraitCropState,
  resolveDefaultCropRect,
} from "@features/common/utils/portraitCrop";
import { loadPortraitImageSize } from "@features/common/utils/portraitUtils";
import "react-advanced-cropper/dist/style.css";
import "./AdvancedImageCropper.css";

const log = createLogger("PortraitPreview");

/** 等裁剪器把图片读进来：超时后就不再补应用默认裁剪，避免"等半天突然跳一下" */
const CROPPER_READY_TIMEOUT_MS = 4000;
/** 轮询间隔：图片解码一般 100~300ms，用 80ms 足够跟手 */
const CROPPER_READY_POLL_MS = 80;

interface PortraitPreviewProps {
  portraitPreview: string | null;
  currentPortrait: Portrait;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  handleImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  /**
   * 角色默认立绘的裁剪参数。
   *
   * <p>为 null 表示这张立绘没有可对齐的默认立绘（角色还没有立绘 / 正在编辑的就是默认立绘
   * 本身），此时按钮不显示 —— 否则点一下只会把裁剪框丢到 (0,0) 那种无意义的位置。
   */
  defaultCropState?: PortraitCropState | null;
  /**
   * 默认立绘的原图路径：`defaultCropState` 存的是**原图像素**，想按比例套到这张
   * （尺寸可能不同的）图上，必须先读默认立绘自己原图的宽高。
   */
  defaultPortraitImagePath?: string | null;
}

const toArea = (rect: {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
} | null): Area | null => {
  if (!rect) return null;
  const { left, top, width, height } = rect;
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }
  return { x: left, y: top, width, height };
};

const PortraitPreview: React.FC<PortraitPreviewProps> = memo(
  ({
    portraitPreview,
    currentPortrait,
    onCropComplete,
    handleImageLoad,
    defaultCropState,
    defaultPortraitImagePath,
  }) => {
    const cropperRef = useRef<CropperRef>(null);
    // 正在为哪张立绘应用默认裁剪：等待图片就绪期间如果换了立绘就废弃这次操作
    const applyingPortraitIdRef = useRef<string | null>(null);
    const unmountedRef = useRef(false);
    const [isApplying, setIsApplying] = useState(false);
    // 「完全一致」做不到时（默认立绘的框超出当前图片）给用户的提示，拖动一次就消失
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
      unmountedRef.current = false;
      return () => {
        unmountedRef.current = true;
      };
    }, []);

    // 渲染日志（原来写在 JSX 里，每渲染一次就往控制台打一条）
    useEffect(() => {
      log("渲染ImageCropper", {
        hasImage: !!portraitPreview,
        portraitID: currentPortrait.portraitID,
        faceX: currentPortrait.faceX,
        faceY: currentPortrait.faceY,
        length: currentPortrait.length,
        hasDefaultCropState: !!defaultCropState,
        defaultPortraitImagePath,
      });
    }, [
      portraitPreview,
      currentPortrait.portraitID,
      currentPortrait.faceX,
      currentPortrait.faceY,
      currentPortrait.length,
      defaultCropState,
      defaultPortraitImagePath,
    ]);

    /**
     * 等裁剪器初始化出 state（= 图片已经读进裁剪器）。
     *
     * <p>图片还没读进来时裁剪器的 state 是 null，这时调 setCoordinates 会把整个画布清空
     * （React 里表现为"点了按钮什么都没发生"，重新加载后裁剪框又回到原样）。
     */
    const waitForCropperState = useCallback(async (portraitId: string) => {
      const startedAt = Date.now();
      while (
        !unmountedRef.current &&
        Date.now() - startedAt < CROPPER_READY_TIMEOUT_MS
      ) {
        if (applyingPortraitIdRef.current !== portraitId) return null;
        const state = cropperRef.current?.getState() ?? null;
        if (state?.imageSize?.width && state?.imageSize?.height) {
          return state;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, CROPPER_READY_POLL_MS),
        );
      }
      return null;
    }, []);

    /** 把裁剪框按默认立绘的比例套到这张图上 */
    const applyDefaultCropState = useCallback(async () => {
      if (!defaultCropState || !cropperRef.current) return;

      const portraitId = currentPortrait.portraitID;
      applyingPortraitIdRef.current = portraitId;
      setIsApplying(true);

      try {
        // 默认立绘的原图尺寸和"裁剪器就绪"互不依赖，并行等
        const sourceSizePromise = loadPortraitImageSize(
          defaultPortraitImagePath,
        );

        let state = cropperRef.current.getState();
        if (!state?.imageSize?.width) {
          state = await waitForCropperState(portraitId);
        }
        // 等图期间换了立绘 / 弹窗关了：这次点击作废
        if (!state || unmountedRef.current) return;
        if (applyingPortraitIdRef.current !== portraitId) return;

        const cropper = cropperRef.current;
        if (!cropper) return;

        const sourceImageSize = await sourceSizePromise;
        if (applyingPortraitIdRef.current !== portraitId) return;

        const { rect, adjusted, mode } = resolveDefaultCropRect({
          crop: defaultCropState,
          sourceImageSize,
          imageSize: state.imageSize,
        });
        if (!rect) {
          log("默认立绘没有可用的裁剪参数，跳过", defaultCropState);
          return;
        }

        log(
          adjusted ? "默认裁剪框越出图片，已按图片范围修正" : "应用默认裁剪状态",
          {
            crop: defaultCropState,
            mode,
            rect,
            sourceImageSize,
            imageSize: state.imageSize,
          },
        );

        cropper.setCoordinates(rect);

        // 回读裁剪器的实际坐标：越界时它会把框夹进图片，
        // 若继续用换算出来的原始值回调，保存下来的坐标就和裁剪框对不上了。
        const actual = toArea(cropper.getCoordinates());
        if (actual && onCropComplete) {
          onCropComplete(actual, actual);
        }

        if (mode === "pixel" && defaultPortraitImagePath) {
          setNotice(
            "读不到默认立绘的原图尺寸，只能按像素照搬裁剪值，可能和这张立绘的头框对不上，请手动微调。",
          );
        } else if (adjusted) {
          setNotice(
            "按默认立绘比例换算的裁剪框超出这张立绘的图片范围，已按边界修正，请手动微调。",
          );
        }
      } finally {
        if (applyingPortraitIdRef.current === portraitId) {
          applyingPortraitIdRef.current = null;
        }
        if (!unmountedRef.current) {
          setIsApplying(false);
        }
      }
    }, [
      defaultCropState,
      defaultPortraitImagePath,
      currentPortrait.portraitID,
      onCropComplete,
      waitForCropperState,
    ]);

    // 裁剪框变化时把实际坐标抛给父组件（缩略图 / 保存都用它）
    const onCropChange = useCallback(
      (cropper: CropperRef | null) => {
        if (!cropper) return;
        const cropData = toArea(cropper.getCoordinates());
        if (cropData && onCropComplete) {
          onCropComplete(cropData, cropData);
        }
        // 用户自己动过裁剪框了，之前的"已按边界修正"提示就没意义了
        setNotice(null);
      },
      [onCropComplete],
    );

    return (
      <div className="portrait-preview">
        {/* 图片预览和裁剪区域 */}
        {portraitPreview && (
          <>
            <img
              src={portraitPreview}
              style={{ display: "none" }}
              onLoad={handleImageLoad}
              alt="预加载图片"
            />
            <div
              className="cropper-controls"
              style={{
                marginBottom: "10px",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "10px",
              }}
            >
              {notice && (
                <span
                  className="cropper-notice"
                  role="status"
                  style={{
                    flex: 1,
                    textAlign: "right",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    color: "#ad4e00",
                  }}
                >
                  {notice}
                </span>
              )}
              {defaultCropState && (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isApplying}
                  title="把裁剪框按比例套用角色默认立绘的裁剪框（原图尺寸不同也能保持同样的头部比例）"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyDefaultCropState();
                  }}
                  style={{
                    padding: "6px 12px",
                    fontSize: "14px",
                    cursor: isApplying ? "progress" : "pointer",
                    marginLeft: notice ? 0 : "10px",
                    flexShrink: 0,
                  }}
                >
                  {isApplying ? "正在应用..." : "裁剪与默认立绘一致"}
                </button>
              )}
            </div>
            <div
              className="cropper-container"
              style={{
                position: "relative",
                width: "100%",
                height: "500px", // 增加高度以适应更大的裁剪区域
                overflow: "hidden",
                backgroundColor: "#e8e8e8",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <Cropper
                ref={cropperRef}
                key={`portrait-${currentPortrait.portraitID}`}
                src={portraitPreview}
                stencilProps={{
                  aspectRatio: 1, // 1:1 宽高比
                }}
                defaultCoordinates={
                  currentPortrait.length
                    ? {
                        left: currentPortrait.faceX || 0,
                        top: currentPortrait.faceY || 0,
                        width: currentPortrait.length,
                        height: currentPortrait.length,
                      }
                    : { left: 0, top: 0, width: 200, height: 200 }
                }
                onChange={onCropChange}
                className="advanced-cropper"
              />
            </div>
          </>
        )}
      </div>
    );
  },
);

PortraitPreview.displayName = "PortraitPreview";

export default PortraitPreview;
