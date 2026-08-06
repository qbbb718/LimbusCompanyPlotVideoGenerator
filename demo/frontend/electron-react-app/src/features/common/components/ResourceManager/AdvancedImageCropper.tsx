
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CropperRef, Cropper } from 'react-advanced-cropper';
import { Point } from 'react-easy-crop';
import './AdvancedImageCropper.css';

interface AdvancedImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedArea: any, croppedAreaPixels: any) => void;
  aspect?: number;
  initialCrop?: Point;
  initialZoom?: number;
  crop?: Point;
  zoom?: number;
  cropSize?: { width: number; height: number };
  portraitId?: string;
}

interface CropperState {
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: number;
  rotation: number;
}

const AdvancedImageCropper: React.FC<AdvancedImageCropperProps> = React.memo(
  ({
    imageSrc,
    onCropComplete,
    aspect = 1,
    initialCrop = { x: 0, y: 0 },
    initialZoom = 1,
    crop,
    zoom,
    cropSize,
    portraitId,
  }) => {
    // 添加调试信息
    console.log('AdvancedImageCropper 渲染', { imageSrc, portraitId });
    
    // 从本地存储加载保存的状态
    const [cropperState, setCropperState] = useState<CropperState>(() => {
      if (!portraitId) {
        return {
          crop: { x: 0, y: 0, width: 100, height: 100 },
          zoom: 1,
          rotation: 0
        };
      }

      try {
        const savedState = localStorage.getItem(`cropper-state-${portraitId}`);
        return savedState ? JSON.parse(savedState) : {
          crop: { x: 0, y: 0, width: 100, height: 100 },
          zoom: 1,
          rotation: 0
        };
      } catch (error) {
        console.error('加载裁剪状态失败', error);
        return {
          crop: { x: 0, y: 0, width: 100, height: 100 },
          zoom: 1,
          rotation: 0
        };
      }
    });

    const cropperRef = useRef<CropperRef>(null);

    // 当状态变化时保存到本地存储
    useEffect(() => {
      if (portraitId) {
        localStorage.setItem(`cropper-state-${portraitId}`, JSON.stringify(cropperState));
      }
    }, [cropperState, portraitId]);

    // 当裁剪完成时更新状态
    const onCropEnd = useCallback((cropper: any) => {
      console.log('onCropEnd 被调用', cropper);
      
      // 获取裁剪数据
      const cropData = cropper.getCoordinates();
      
      if (cropData) {
        setCropperState({
          crop: {
            x: cropData.left,
            y: cropData.top,
            width: cropData.width,
            height: cropData.height
          },
          zoom: cropperState.zoom,
          rotation: cropperState.rotation
        });

        // 调用原有的回调函数
        if (onCropComplete) {
          onCropComplete(cropData, cropData);
        }
      }
    }, [onCropComplete, cropperState]);

    // 如果有外部传入的crop和zoom，则使用它们
    useEffect(() => {
      if (crop && zoom && cropperRef.current) {
        cropperRef.current.setCoordinates({
          left: crop.x,
          top: crop.y,
          width: cropSize?.width || 100,
          height: cropSize?.height || 100
        });
        // react-advanced-cropper 使用不同的 API，这里暂时注释掉
        // cropperRef.current.setZoom(zoom);
      }
    }, [crop, zoom, cropSize]);

    console.log('渲染 Cropper 组件', { imageSrc, cropperState });
    return (
      <div style={{ position: "relative", width: "100%", height: "500px" }}>
        <Cropper
          ref={cropperRef}
          src={imageSrc}
          stencilProps={{
            aspectRatio: aspect
          }}
          defaultCoordinates={cropperState.crop}
          // 使用 onChange 事件监听器
          onChange={onCropEnd}
          // 添加必要的样式
          style={{ height: '100%' }}
          // 确保裁剪器可见
          className={'advanced-cropper'}
        />
      </div>
    );
  }
);

AdvancedImageCropper.displayName = 'AdvancedImageCropper';

export default AdvancedImageCropper;
