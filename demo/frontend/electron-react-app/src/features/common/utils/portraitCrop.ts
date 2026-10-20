/**
 * 立绘裁剪框换算工具（纯函数，方便单测）
 *
 * 背景：立绘的裁剪参数 `{ faceX, faceY, length }` 存的是**原图像素**，
 * 渲染时后端按 `length` 把裁剪框缩放到固定的头部像素高度
 * （`CharacterVisual` 里 `renderScale = DEFAULT_CHARACTER_HEAD_LENGTH / length`），所以：
 * - 原图尺寸相同时，裁剪框像素值可以直接照搬；
 * - 原图尺寸不同时（同一角色导出了 1600×2432 和 640×983 两版图），照搬像素值会让
 *   头框在图上占的比例完全变样 —— 1600 宽的图上 400px 的框占 25% 宽，
 *   照搬到 640 宽的图上就成了 62.5% 宽，渲染出来的人物一个大一个小。
 *
 * 因此「裁剪与默认立绘一致」按**比例**换算：先把默认立绘的框换成相对它自己原图的
 * 比例（中心点 + 边长占宽度的比例），再按同样的比例落到目标图上，最后夹进图片范围。
 * 只有拿不到默认立绘原图尺寸时（图片加载失败 / 老数据没有原图）才退回按像素照搬。
 *
 * 为什么不按「左上角 + 边长」直接乘缩放：两张图长宽比略有差别时，按左上角换算会让
 * 框整体往一边偏；按**中心点**换算才能保证头部还在人物脸上的同一个位置。
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
 * 裁剪框相对原图的比例（0~1）。
 *
 * - `centerXRatio`：框中心 X / 图片宽度
 * - `centerYRatio`：框中心 Y / 图片高度
 * - `sideRatio`：框边长 / 图片宽度
 *
 * 边长按**宽度**取值：渲染时人物是按图片宽度铺开的，保持"头部框占图片宽度的比例"
 * 不变，两张不同分辨率的立绘才会渲染成同样大小的人物。
 */
export interface PortraitCropRatio {
  centerXRatio: number;
  centerYRatio: number;
  sideRatio: number;
}

/** 换算方式：`ratio` = 按默认立绘原图的比例；`pixel` = 按像素照搬（拿不到尺寸时的兜底） */
export type CropScaleMode = "ratio" | "pixel";

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

/** 图片尺寸是否可用（宽高都是正数） */
const isUsableImageSize = (
  imageSize?: ImageSize | null,
): imageSize is ImageSize =>
  !!imageSize &&
  Number.isFinite(imageSize.width) &&
  Number.isFinite(imageSize.height) &&
  imageSize.width > 0 &&
  imageSize.height > 0;

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

/**
 * 把裁剪参数换成相对原图的比例。
 *
 * @param crop      默认立绘的裁剪参数（原图像素）
 * @param imageSize 默认立绘自己的原图尺寸
 * @returns 尺寸/裁剪参数不可用时返回 null（调用方退回按像素照搬）
 */
export const toCropRatio = (
  crop?: PortraitCropState | null,
  imageSize?: ImageSize | null,
): PortraitCropRatio | null => {
  if (!isValidCropState(crop) || !isUsableImageSize(imageSize)) {
    return null;
  }
  const { faceX, faceY, length } = crop;
  return {
    centerXRatio: (faceX + length / 2) / imageSize.width,
    centerYRatio: (faceY + length / 2) / imageSize.height,
    sideRatio: length / imageSize.width,
  };
};

/**
 * 把比例落到目标图片上，得到实际裁剪框（已夹进图片范围）。
 */
export const resolveCropRatioRect = (
  ratio: PortraitCropRatio,
  imageSize: ImageSize,
): { rect: CropRect; adjusted: boolean } => {
  // 边长按目标图宽度换算，保证头部框占图片宽度的比例不变
  const side = Math.max(1, Math.round(ratio.sideRatio * imageSize.width));
  const target: CropRect = {
    left: Math.round(ratio.centerXRatio * imageSize.width - side / 2),
    top: Math.round(ratio.centerYRatio * imageSize.height - side / 2),
    width: side,
    height: side,
  };
  const rect = clampCropRect(target, imageSize);
  const adjusted =
    rect.left !== target.left ||
    rect.top !== target.top ||
    rect.width !== target.width;
  return { rect, adjusted };
};

export interface ResolvedDefaultCrop {
  /** 换算后的裁剪框；默认立绘没有有效裁剪参数时为 null */
  rect: CropRect | null;
  /** 是否被夹进了图片范围（说明"完全一致"做不到） */
  adjusted: boolean;
  /** 用了哪种换算方式（提示文案 / 日志会用到） */
  mode: CropScaleMode;
}

/**
 * 把默认立绘的裁剪参数换算成当前图片上的裁剪框。
 *
 * @param crop            默认立绘的裁剪参数（原图像素）
 * @param sourceImageSize 默认立绘自己的原图尺寸；给了才按比例换算
 * @param imageSize       当前图片的原图尺寸；未知（图片还没加载完）时只做取整，不做夹取
 */
export const resolveDefaultCropRect = (params: {
  crop?: PortraitCropState | null;
  sourceImageSize?: ImageSize | null;
  imageSize?: ImageSize | null;
}): ResolvedDefaultCrop => {
  const { crop, sourceImageSize, imageSize } = params;
  if (!isValidCropState(crop)) {
    return { rect: null, adjusted: false, mode: "pixel" };
  }

  // 目标图尺寸未知：裁剪器还没读到图，存下来的值取整交给它就行
  if (!isUsableImageSize(imageSize)) {
    const side = Math.max(1, Math.round(crop.length));
    return {
      rect: {
        left: Math.round(crop.faceX),
        top: Math.round(crop.faceY),
        width: side,
        height: side,
      },
      adjusted: false,
      mode: "pixel",
    };
  }

  const ratio = toCropRatio(crop, sourceImageSize);
  if (ratio) {
    const { rect, adjusted } = resolveCropRatioRect(ratio, imageSize);
    return { rect, adjusted, mode: "ratio" };
  }

  // 老行为：拿不到默认立绘原图尺寸时按像素照搬，再夹进图片
  const side = Math.max(1, Math.round(crop.length));
  const target: CropRect = {
    left: Math.round(crop.faceX),
    top: Math.round(crop.faceY),
    width: side,
    height: side,
  };
  const rect = clampCropRect(target, imageSize);
  const adjusted =
    rect.left !== target.left ||
    rect.top !== target.top ||
    rect.width !== target.width;

  return { rect, adjusted, mode: "pixel" };
};
