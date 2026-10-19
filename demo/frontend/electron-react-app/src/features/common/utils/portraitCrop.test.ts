import {
  clampCropRect,
  isValidCropState,
  resolveDefaultCropRect,
} from "./portraitCrop";

/**
 * 「裁剪与默认立绘一致」的核心换算：
 * 默认立绘的裁剪参数 → 当前这张立绘上的裁剪框。
 *
 * 这里全是纯函数，真实的裁剪器（react-advanced-cropper）不参与断言。
 */
describe("立绘裁剪框换算", () => {
  describe("isValidCropState", () => {
    test("长度大于 0 才算有效", () => {
      expect(isValidCropState({ faceX: 10, faceY: 20, length: 30 })).toBe(true);
      expect(isValidCropState({ faceX: 10, faceY: 20, length: 0 })).toBe(false);
      expect(isValidCropState({ faceX: 10, faceY: 20, length: -5 })).toBe(false);
      expect(isValidCropState(null)).toBe(false);
      expect(isValidCropState(undefined)).toBe(false);
    });

    test("坐标不是数字时判为无效（避免把 NaN 写进立绘）", () => {
      expect(isValidCropState({ faceX: NaN, faceY: 0, length: 100 })).toBe(
        false,
      );
      expect(isValidCropState({ faceX: 0, faceY: 0, length: NaN })).toBe(false);
    });
  });

  describe("resolveDefaultCropRect", () => {
    test("图片尺寸一致时原样照搬默认立绘的裁剪框", () => {
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: 243, faceY: 0, length: 192 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 243, top: 0, width: 192, height: 192 });
      expect(adjusted).toBe(false);
    });

    test("默认立绘的框越出右边界时夹进图片（保存值必须和裁剪框一致）", () => {
      // 默认立绘来自更宽的 1149 宽原图，照搬到 650 宽的图上会越界
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: 568, faceY: 0, length: 203 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 447, top: 0, width: 203, height: 203 });
      expect(adjusted).toBe(true);
    });

    test("默认立绘的框比图还大时缩到短边长度", () => {
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: 100, faceY: 100, length: 1200 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 0, top: 100, width: 650, height: 650 });
      expect(adjusted).toBe(true);
    });

    test("负坐标（历史脏数据）夹回 0", () => {
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: -20, faceY: -30, length: 180 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 0, top: 0, width: 180, height: 180 });
      expect(adjusted).toBe(true);
    });

    test("图片尺寸未知时只取整，不做夹取", () => {
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: 243.6, faceY: 0.4, length: 191.5 },
        imageSize: null,
      });

      expect(rect).toEqual({ left: 244, top: 0, width: 192, height: 192 });
      expect(adjusted).toBe(false);
    });

    test("没有默认立绘的裁剪参数时返回 null（按钮不显示）", () => {
      expect(
        resolveDefaultCropRect({
          crop: { faceX: 0, faceY: 0, length: 0 },
          imageSize: { width: 650, height: 1417 },
        }),
      ).toEqual({ rect: null, adjusted: false });
      expect(resolveDefaultCropRect({ crop: null })).toEqual({
        rect: null,
        adjusted: false,
      });
    });
  });

  describe("clampCropRect", () => {
    test("框大于图片短边时缩到短边", () => {
      expect(
        clampCropRect(
          { left: 0, top: 0, width: 900, height: 900 },
          { width: 660, height: 1505 },
        ),
      ).toEqual({ left: 0, top: 0, width: 660, height: 660 });
    });

    test("正好贴边时不改位置", () => {
      expect(
        clampCropRect(
          { left: 465, top: 1250, width: 195, height: 195 },
          { width: 660, height: 1505 },
        ),
      ).toEqual({ left: 465, top: 1250, width: 195, height: 195 });
    });

    test("边长为 0 的脏数据也给出可用的 1px 框，不给裁剪器传 0", () => {
      expect(
        clampCropRect(
          { left: 10, top: 10, width: 0, height: 0 },
          { width: 660, height: 1505 },
        ),
      ).toEqual({ left: 10, top: 10, width: 1, height: 1 });
    });
  });
});
