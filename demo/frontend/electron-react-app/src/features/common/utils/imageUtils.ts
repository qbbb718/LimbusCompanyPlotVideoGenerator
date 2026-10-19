import { Area } from 'react-easy-crop';

/** 原位图上的裁剪框（左上角 + 边长，单位=原图像素） */
export interface PixelCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 加载一张图片并等它解码完，拿到 naturalWidth / naturalHeight。
 *
 * @param src 图片地址（http / blob / data URL 都行）
 */
export const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    // 后端图片是跨域资源（localhost:8081），不设 crossOrigin 会让 canvas 污染、toBlob 抛异常
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error(`图片加载失败: ${src}`)));
    img.src = src;
  });

/**
 * 用**已经加载好**的图片元素裁一块出来（不再重复 decode 同一张原图）。
 *
 * @param image   已加载完成的 img
 * @param cropRect 原图像素坐标的裁剪框
 * @returns PNG Blob；画布不可用时 reject
 */
export const createCroppedImageFromElement = (
  image: HTMLImageElement,
  cropRect: PixelCropRect,
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('No 2d context'));
  }

  const width = Math.max(1, Math.round(cropRect.width));
  const height = Math.max(1, Math.round(cropRect.height));
  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(
    image,
    Math.round(cropRect.left),
    Math.round(cropRect.top),
    width,
    height,
    0,
    0,
    width,
    height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('裁剪失败：canvas.toBlob 返回空'));
      }
    }, 'image/png');
  });
};

/**
 * 创建缩略图
 * @param imageSrc 原始图片URL
 * @param pixelCrop 裁剪区域像素值
 * @returns 返回缩略图的Blob对象
 */
export const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> => {
  const image = await loadImageElement(imageSrc);

  return createCroppedImageFromElement(image, {
    left: pixelCrop.x,
    top: pixelCrop.y,
    width: pixelCrop.width,
    height: pixelCrop.height,
  });
};

/**
 * 将Blob转换为Base64字符串
 * @param blob Blob对象
 * @returns base64字符串
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除data:image/png;base64,前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
