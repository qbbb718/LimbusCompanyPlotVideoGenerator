import React, { memo, useState, useRef, useCallback } from "react";
import { CropperRef, Cropper } from "react-advanced-cropper";
import { Area } from "react-easy-crop";
import { Portrait } from "../../../../../types";
import createLogger from "../utils/logger";
import "react-advanced-cropper/dist/style.css";
import "./AdvancedImageCropper.css";

const log = createLogger("PortraitPreview");

interface PortraitPreviewProps {
  portraitPreview: string | null;
  crop: { x: number; y: number };
  zoom: number;
  currentPortrait: Portrait;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  handleImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

const PortraitPreview: React.FC<PortraitPreviewProps> = memo(
  ({
    portraitPreview,
    crop,
    zoom,
    currentPortrait,
    onCropComplete,
    handleImageLoad,
  }) => {
    const [localCrop, setLocalCrop] = useState(crop);
    const [localZoom, setLocalZoom] = useState(zoom);
    const cropperRef = useRef<CropperRef>(null);

    // 当裁剪完成时更新状态
    const onCropChange = useCallback((cropper: any) => {
      if (!cropper) return;

      // 获取裁剪数据
      const cropData = cropper.getCoordinates();
      if (cropData) {
        // 转换为react-easy-crop格式的数据
        const easyCropFormat = {
          x: cropData.left,
          y: cropData.top,
          width: cropData.width,
          height: cropData.height
        };

        // 转换为Area格式
        const area: Area = {
          x: cropData.left,
          y: cropData.top,
          width: cropData.width,
          height: cropData.height
        };

        // 调用原有的回调函数
        if (onCropComplete) {
          onCropComplete(area, area);
        }
      }
    }, [onCropComplete]);
    return (
      <div className="portrait-preview">
        {/* 图片预览和裁剪区域 */}
        {portraitPreview && (
          <>
            {log("渲染ImageCropper", {
              imageSrc: portraitPreview ? "已加载" : "未加载",
              crop,
              zoom,
              cropSize: currentPortrait.length
                ? {
                    width: currentPortrait.length,
                    height: currentPortrait.length,
                  }
                : undefined,
              portraitID: currentPortrait.portraitID,
              faceX: currentPortrait.faceX,
              faceY: currentPortrait.faceY,
              length: currentPortrait.length,
            })}
            <img
              src={portraitPreview}
              style={{ display: "none" }}
              onLoad={handleImageLoad}
              alt="预加载图片"
            />
            <div className="cropper-container" style={{
              position: "relative",
              width: "100%",
              height: "500px", // 增加高度以适应更大的裁剪区域
              overflow: "hidden",
              backgroundColor: "#f5f5f5",
              border: "1px solid #ddd",
              borderRadius: "4px"
            }}>
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
  }
);

export default PortraitPreview;
