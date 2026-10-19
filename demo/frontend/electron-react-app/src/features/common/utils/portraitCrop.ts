/**
 * 立绘裁剪框换算工具（纯函数，方便单测）
 *
 * 背景：立绘的裁剪参数 `{ faceX, faceY, length }` 存的是**原图像素**，
 * 渲染时后端按 `length` 把裁剪框缩放到固定的头部像素高度，所以：
 * - 同一角色、同一尺寸的原图之间，裁剪框像素值可以直接照搬；
 * - 原图尺寸不同（换了分辨率的导出图）时，照搬的像素值可能越界，
 *   越界后 react-advanced-cropper 会把框夹进图片，但**保存的值**如果还用照搬的
 *   原始值，就会出现「裁剪框在图片里、存下来的坐标却在图片外」的错位。
 * 所以「裁剪与默认立绘一致」统一走这里：先算出目标框，再夹进当前图片范围，
 * 保存时用的也是夹过之后的实际坐标。
 */

/** 立绘里保存的裁剪参数（原图像素） */
export interface PortraitCropState {
  faceX: number;
  faceY: number;
  length: number;
}

/** 图片尺寸（原图像素） */
export interface ImageSize {
  width: number;
  height: number;
}

/** 正方形裁剪框（原图像素） */
export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 裁剪参数是否可用：`length <= 0` 表示这张立绘还没框过头，
 * 不能拿来当"默认立绘的裁剪框"。
 */
export const isValidCropState = (
  crop?: PortraitCropState | null,
): crop is PortraitCropState => {
  if (!crop) return false;
  const { faceX, faceY, length } = crop;
  return (
    Number.isFinite(faceX) &&
    Number.isFinite(faceY) &&
    Number.isFinite(length) &&
    length > 0
  );
};

/**
 * 把正方形裁剪框夹进图片范围：
 * 边长不超过图片的短边，左上角不越出右/下边界。
 */
export const clampCropRect = (
  rect: CropRect,
  imageSize: ImageSize,
): CropRect => {
  const imageWidth = Math.max(0, Math.round(imageSize.width));
  const imageHeight = Math.max(0, Math.round(imageSize.height));
  const maxSide = Math.max(1, Math.min(imageWidth, imageHeight));
  const width = Math.min(Math.max(1, Math.round(rect.width)), maxSide);
  const left = Math.min(
    Math.max(0, Math.round(rect.left)),
    Math.max(0, imageWidth - width),
  );
  const top = Math.min(
    Math.max(0, Math.round(rect.top)),
    Math.max(0, imageHeight - width),
  );
  return { left, top, width, height: width };
};

export interface ResolvedDefaultCrop {
  /** 换算后的裁剪框；默认立绘没有有效裁剪参数时为 null */
  rect: CropRect | null;
  /** 是否被夹进了图片范围（说明"完全一致"做不到） */
  adjusted: boolean;
}

/**
 * 把默认立绘的裁剪参数换算成当前图片上的裁剪框。
 *
 * @param crop     默认立绘的裁剪参数
 * @param imageSize 当前图片的原图尺寸；未知（图片还没加载完）时只做取整，不做夹取
 */
export const resolveDefaultCropRect = (params: {
  crop?: PortraitCropState | null;
  imageSize?: ImageSize | null;
}): ResolvedDefaultCrop => {
  const { crop, imageSize } = params;
  if (!isValidCropState(crop)) {
    return { rect: null, adjusted: false };
  }

  // 立绘框是正方形：宽高都取 length（老数据里 length 是边长，不是半边长）
  const length = Math.round(crop.length);
  const target: CropRect = {
    left: Math.round(crop.faceX),
    top: Math.round(crop.faceY),
    width: length,
    height: length,
  };

  if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) {
    return { rect: target, adjusted: false };
  }

  const rect = clampCropRect(target, imageSize);
  const adjusted =
    rect.left !== target.left ||
    rect.top !== target.top ||
    rect.width !== target.width;

  return { rect, adjusted };
};
