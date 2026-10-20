import {
  clampCropRect,
  isValidCropState,
  resolveDefaultCropRect,
  toCropRatio,
} from "./portraitCrop";

/**
 * 「裁剪与默认立绘一致」的核心换算：
 * 默认立绘的裁剪参数 → 按默认立绘原图的比例 → 当前这张立绘上的裁剪框。
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

  describe("toCropRatio", () => {
    test("把像素框换成相对原图的比例", () => {
      const ratio = toCropRatio(
        { faceX: 568, faceY: 0, length: 400 },
        { width: 1600, height: 2432 },
      );

      expect(ratio).not.toBeNull();
      // 中心 X = (568 + 400/2) / 1600
      expect(ratio?.centerXRatio).toBeCloseTo(0.48, 10);
      // 中心 Y = (0 + 400/2) / 2432
      expect(ratio?.centerYRatio).toBeCloseTo(200 / 2432, 10);
      // 边长占原图宽度的比例
      expect(ratio?.sideRatio).toBeCloseTo(0.25, 10);
    });

    test("尺寸或裁剪参数不可用时返回 null", () => {
      expect(
        toCropRatio({ faceX: 0, faceY: 0, length: 100 }, { width: 0, height: 0 }),
      ).toBeNull();
      expect(
        toCropRatio({ faceX: 0, faceY: 0, length: 0 }, { width: 100, height: 200 }),
      ).toBeNull();
      expect(toCropRatio(null, { width: 100, height: 200 })).toBeNull();
      expect(toCropRatio({ faceX: 0, faceY: 0, length: 10 }, null)).toBeNull();
    });
  });

  describe("resolveDefaultCropRect", () => {
    test("原图尺寸一致时，按比例换算出来的框和原来的像素值完全相同", () => {
      const { rect, adjusted, mode } = resolveDefaultCropRect({
        crop: { faceX: 243, faceY: 0, length: 192 },
        sourceImageSize: { width: 650, height: 1417 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 243, top: 0, width: 192, height: 192 });
      expect(adjusted).toBe(false);
      expect(mode).toBe("ratio");
    });

    test("原图尺寸不同时按比例缩放（1600×2432 → 640×983）", () => {
      // 大图上 400px 的头框占 25% 宽；小图宽 640，所以框边长应该是 160
      const { rect, adjusted, mode } = resolveDefaultCropRect({
        crop: { faceX: 568, faceY: 0, length: 400 },
        sourceImageSize: { width: 1600, height: 2432 },
        imageSize: { width: 640, height: 983 },
      });

      expect(rect).toEqual({ left: 227, top: 1, width: 160, height: 160 });
      expect(adjusted).toBe(false);
      expect(mode).toBe("ratio");
    });

    test("比例换算后越出右边界时夹进图片（保存值必须和裁剪框一致）", () => {
      // 大图上框贴着右边缘，换算到窄图上中心会越过边界
      const { rect, adjusted, mode } = resolveDefaultCropRect({
        crop: { faceX: 1400, faceY: 0, length: 400 },
        sourceImageSize: { width: 1600, height: 2432 },
        imageSize: { width: 640, height: 983 },
      });

      expect(rect).toEqual({ left: 480, top: 1, width: 160, height: 160 });
      expect(adjusted).toBe(true);
      expect(mode).toBe("ratio");
    });

    test("比例算出来的框比图还大时缩到短边长度", () => {
      // 默认立绘的裁剪参数本身就越界（历史脏数据），比例换算后同样要夹回来
      const { rect, adjusted } = resolveDefaultCropRect({
        crop: { faceX: 100, faceY: 100, length: 2000 },
        sourceImageSize: { width: 1300, height: 1417 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 0, top: 600, width: 650, height: 650 });
      expect(adjusted).toBe(true);
    });

    test("拿不到默认立绘原图尺寸时退回按像素照搬", () => {
      const { rect, adjusted, mode } = resolveDefaultCropRect({
        crop: { faceX: 568, faceY: 0, length: 203 },
        sourceImageSize: null,
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 447, top: 0, width: 203, height: 203 });
      expect(adjusted).toBe(true);
      expect(mode).toBe("pixel");
    });

    test("默认立绘尺寸是脏数据时也退回按像素照搬", () => {
      const { rect, mode } = resolveDefaultCropRect({
        crop: { faceX: 10, faceY: 20, length: 30 },
        sourceImageSize: { width: 0, height: 2432 },
        imageSize: { width: 650, height: 1417 },
      });

      expect(rect).toEqual({ left: 10, top: 20, width: 30, height: 30 });
      expect(mode).toBe("pixel");
    });

    test("目标图尺寸未知时只取整，不做夹取", () => {
      const { rect, adjusted, mode } = resolveDefaultCropRect({
        crop: { faceX: 243.6, faceY: 0.4, length: 191.5 },
        sourceImageSize: { width: 1600, height: 2432 },
        imageSize: null,
      });

      expect(rect).toEqual({ left: 244, top: 0, width: 192, height: 192 });
      expect(adjusted).toBe(false);
      expect(mode).toBe("pixel");
    });

    test("没有默认立绘的裁剪参数时返回 null（按钮不显示）", () => {
      expect(
        resolveDefaultCropRect({
          crop: { faceX: 0, faceY: 0, length: 0 },
          imageSize: { width: 650, height: 1417 },
        }),
      ).toEqual({ rect: null, adjusted: false, mode: "pixel" });
      expect(resolveDefaultCropRect({ crop: null })).toEqual({
        rect: null,
        adjusted: false,
        mode: "pixel",
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
