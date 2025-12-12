
/**
 * 图像处理相关工具函数
 */

/**
 * 计算图片裁剪的合适缩放级别
 * @param portraitLength 裁剪区域大小
 * @param imgWidth 图片宽度
 * @param imgHeight 图片高度
 * @returns 计算出的缩放级别
 */
export const calculateZoomLevel = (portraitLength: number, imgWidth: number, imgHeight: number): number => {
  const cropWidthRatio = portraitLength / imgWidth;
  const cropHeightRatio = portraitLength / imgHeight;
  const baseRatio = Math.max(cropWidthRatio, cropHeightRatio);
  return Math.min(2, Math.max(0.5, 1 / baseRatio));
};

/**
 * 加载图片并转换为base64格式
 * @param imagePath 图片路径
 * @returns Promise<string> base64格式的图片URL
 */
export const loadImageAsBase64 = async (imagePath: string): Promise<string> => {
  try {
    // 在Electron环境中，使用electronAPI读取文件
    if (window.electronAPI) {
      const fileBuffer = await window.electronAPI.readFile(imagePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const blob = new Blob([uint8Array]);

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      // 非Electron环境，直接返回图片URL
      return imagePath.startsWith('http') ? imagePath : `http://localhost:8080/${imagePath}`;
    }
  } catch (error) {
    console.error('加载图片失败:', error);
    throw error;
  }
};

export default {
  calculateZoomLevel,
  loadImageAsBase64
};
