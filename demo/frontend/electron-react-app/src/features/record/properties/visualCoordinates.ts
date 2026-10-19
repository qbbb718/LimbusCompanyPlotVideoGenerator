import { AppConfig } from "@features/common/config/appConfig";

/**
 * 设计画布尺寸（与后端 ProjectConfig.VIDEO_WIDTH / VIDEO_HEIGHT 一致）。
 *
 * <p>记录里持久化的所有像素坐标（立绘 adjX/adjY、背景 posX/posY）都存这个 1080p 空间里的值，
 * 与设置页选的输出分辨率无关；设置页的「视频尺寸」只决定最终成片大小。
 * 编辑器里的数值框 / 滑杆按当前输出尺寸显示（例如 1280×720 时画布中心是 640,360），
 * 写回记录前统一换算回设计画布像素。
 */
export const DESIGN_CANVAS_WIDTH = AppConfig.designCanvas.width;
export const DESIGN_CANVAS_HEIGHT = AppConfig.designCanvas.height;

/** 缩放控件范围 / 步长：与「临时图片」的缩放控制保持一致（0.1 ~ 3.0） */
export const MIN_VISUAL_SCALE = 0.1;
export const MAX_VISUAL_SCALE = 3.0;
export const VISUAL_SCALE_STEP = 0.1;

/**
 * 把记录里的 scale 归一化成可用值：缺省 / 非法（0、负数、NaN）按 1.0，越界的收敛到
 * [0.1, 3.0]。后端 CharacterVisual / BackgroundVisual 对非法值和上下限也是同一套兜底，
 * 保证界面显示的数值与实际渲染一致。
 */
export const normalizeScale = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.min(MAX_VISUAL_SCALE, Math.max(MIN_VISUAL_SCALE, value));
};

export interface CoordinateMapper {
  /** 滑杆 / 数值框所在坐标系（= 设置页选的输出尺寸）的宽 */
  uiWidth: number;
  /** 滑杆 / 数值框所在坐标系的宽高 */
  uiHeight: number;
  /** 设计画布像素 → 当前输出像素（只用于显示） */
  toUiX: (designX: number) => number;
  toUiY: (designY: number) => number;
  /** 当前输出像素 → 设计画布像素（用于写回记录，保证与输出分辨率无关） */
  toDesignX: (uiX: number) => number;
  toDesignY: (uiY: number) => number;
}

/**
 * 创建设计画布 ↔ 当前输出尺寸的坐标换算器。
 *
 * @param videoWidth  设置页选的输出宽度；缺省/非法时回退到设计画布宽度
 * @param videoHeight 设置页选的输出高度；缺省/非法时回退到设计画布高度
 */
export const createCoordinateMapper = (
  videoWidth?: number,
  videoHeight?: number,
): CoordinateMapper => {
  const uiWidth =
    videoWidth && videoWidth > 0 ? videoWidth : DESIGN_CANVAS_WIDTH;
  const uiHeight =
    videoHeight && videoHeight > 0 ? videoHeight : DESIGN_CANVAS_HEIGHT;

  return {
    uiWidth,
    uiHeight,
    toUiX: (designX) => Math.round((designX * uiWidth) / DESIGN_CANVAS_WIDTH),
    toUiY: (designY) =>
      Math.round((designY * uiHeight) / DESIGN_CANVAS_HEIGHT),
    toDesignX: (uiX) => Math.round((uiX * DESIGN_CANVAS_WIDTH) / uiWidth),
    toDesignY: (uiY) =>
      Math.round((uiY * DESIGN_CANVAS_HEIGHT) / uiHeight),
  };
};

/**
 * 背景位置（相对画面中心的偏移）滑块的可达范围，单位是当前输出像素。
 *
 * <p>取「缩放后的背景尺寸 + 画布尺寸」的一半：滑到端点时背景正好完全移出画面
 * （左边缘贴住画布右边缘 / 右边缘贴住画布左边缘）。范围随缩放自动变大，
 * 所以放大后的背景仍然能被推出去；数值框本身不设上下限，可以输入更大的值。
 *
 * @param uiSize 当前输出尺寸（X 用宽度、Y 用高度）
 * @param scale  背景缩放
 */
export const backgroundOffsetLimit = (
  uiSize: number,
  scale: number,
): number => {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.ceil((uiSize * safeScale + uiSize) / 2);
};
