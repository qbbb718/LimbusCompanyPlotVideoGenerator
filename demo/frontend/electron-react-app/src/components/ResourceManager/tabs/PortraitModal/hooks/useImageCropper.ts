
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Area } from 'react-easy-crop';
import { Portrait } from '../../../../../types';
import { calculateZoomLevel } from '../utils/imageUtils';
import createLogger from '../utils/logger';

const log = createLogger('useImageCropper');

export const useImageCropper = (portrait: Portrait | null) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // 裁剪完成回调
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    log('裁剪完成', { croppedArea, croppedAreaPixels });
    setCroppedArea(croppedArea);
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // 图片加载完成后的处理
  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    if (!portrait) return;

    log('图片加载完成，设置裁剪参数');
    setIsImageLoaded(true);
  }, [portrait]);

  // 使用 useMemo 缓存裁剪参数计算
  const cropParameters = useMemo(() => {
    if (!isImageLoaded || !portrait) {
      log('跳过裁剪参数设置', { isImageLoaded, portraitId: portrait?.portraitID });
      return null;
    }

    log('开始设置裁剪参数', { portraitId: portrait.portraitID });

    // 恢复裁剪区域的位置
    const faceX = portrait.faceX || 0;
    const faceY = portrait.faceY || 0;
    log('恢复裁剪区域位置', { faceX, faceY });
    const newCrop = { x: faceX, y: faceY };

    // 计算并设置适当的缩放级别
    if (portrait.length > 0) {
      log('恢复裁剪区域大小', { length: portrait.length });

      // 获取图片的实际尺寸
      const img = document.querySelector('img[alt="预加载图片"]') as HTMLImageElement;
      if (!img) {
        log('找不到预加载图片元素');
        return null;
      }

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;

      log('图片尺寸', { width: imgWidth, height: imgHeight });

      // 计算合适的缩放级别
      const calculatedZoom = calculateZoomLevel(portrait.length, imgWidth, imgHeight);

      log('计算缩放级别', {
        portraitLength: portrait.length,
        imgWidth,
        imgHeight,
        calculatedZoom
      });

      return {
        crop: newCrop,
        zoom: calculatedZoom,
        hasLength: true
      };
    } else {
      log('没有裁剪区域大小，使用默认缩放级别');
      return {
        crop: newCrop,
        zoom: 1,
        hasLength: false
      };
    }
  }, [isImageLoaded, portrait]);

  // 当裁剪参数计算完成时，应用参数
  useEffect(() => {
    if (!cropParameters) return;

    setCrop(cropParameters.crop);
    setZoom(cropParameters.zoom);
    
    if (cropParameters.hasLength) {
      log('裁剪参数已设置', { crop: cropParameters.crop, zoom: cropParameters.zoom });
    } else {
      log('默认裁剪参数已设置', { crop: cropParameters.crop, zoom: cropParameters.zoom });
    }
  }, [cropParameters]);

  // 重置裁剪参数
  const resetCropParameters = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsImageLoaded(false);
    setCroppedArea(null);
    setCroppedAreaPixels(null);
  }, []);

  return {
    crop,
    setCrop,
    zoom,
    setZoom,
    isImageLoaded,
    setIsImageLoaded,
    croppedArea,
    croppedAreaPixels,
    onCropComplete,
    handleImageLoad,
    resetCropParameters
  };
};

export default useImageCropper;
