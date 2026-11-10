import {
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  VIEW_ZOOM_STEP,
  actualSizeView,
  clampView,
  clampViewPan,
  clampViewScale,
  cssToFrame,
  fitScale,
  fitView,
  formatZoomPercent,
  frameToCss,
  isActualSizeView,
  isFitView,
  normalizeWheelDelta,
  parseZoomPercent,
  viewScaleBounds,
  wheelZoomFactor,
  zoomPercent,
  zoomViewAt,
} from "./referenceView";

/**
 * 「截图舞台查看视图」的几何与输入解析。
 *
 * <p>关键约束（都是这轮需求的验收点）：
 * <ul>
 *   <li>缩放比例 = CSS 像素 / 画面像素，1 = 100%；</li>
 *   <li>以锚点缩放时锚点下的内容必须**不动**；</li>
 *   <li>画面比舞台小就居中、比舞台大就不许露白；</li>
 *   <li>视图变换与校准数据完全无关（这里根本不 import 任何裁剪计算）。</li>
 * </ul>
 */

/** 一个标准 16:9 舞台（约等于 1100×620 的弹窗舞台） */
const STAGE = { width: 960, height: 540 };

describe("截图舞台视图变换", () => {
  describe("适应窗口与比例边界", () => {
    test("适应窗口的比例 = 舞台宽 / 1920", () => {
      expect(fitScale(STAGE)).toBeCloseTo(0.5, 9);
      expect(fitScale({ width: 1280, height: 720 })).toBeCloseTo(2 / 3, 9);
    });

    test("比例上下限：25% 起，上限至少 400% 且至少 4× 适应", () => {
      expect(viewScaleBounds(STAGE)).toEqual({
        min: MIN_VIEW_SCALE,
        max: MAX_VIEW_SCALE,
      });

      // 大窗口：适应就已经 100%，上限仍要留到 400%
      expect(viewScaleBounds({ width: 1920, height: 1080 }).max).toBe(4);

      // 小窗口：适应只有 ~10%，下限跟着降，保证还能缩到"适应"
      const tiny = viewScaleBounds({ width: 200, height: 112.5 });
      expect(tiny.min).toBeCloseTo(200 / 1920, 9);
      expect(tiny.max).toBe(4);
    });

    test("适应窗口：16:9 舞台正好铺满、不平移", () => {
      expect(fitView(STAGE)).toEqual({ scale: 0.5, panX: 0, panY: 0 });
      // 非 16:9 的舞台（测试/异常尺寸）纵向居中
      expect(fitView({ width: 960, height: 720 })).toEqual({
        scale: 0.5,
        panX: 0,
        panY: 90,
      });
    });

    test("100%：scale = 1；放不下时左上角对齐（pan 为 0）", () => {
      const view = actualSizeView(STAGE);
      expect(view.scale).toBe(1);
      expect(view.panX).toBe(0);
      expect(view.panY).toBe(0);
      expect(isActualSizeView(view)).toBe(true);
      expect(isFitView(view, STAGE)).toBe(false);
      expect(isFitView(fitView(STAGE), STAGE)).toBe(true);
    });

    test("比例夹取", () => {
      expect(clampViewScale(0.001, STAGE)).toBeCloseTo(0.25, 9);
      expect(clampViewScale(99, STAGE)).toBeCloseTo(4, 9);
      expect(clampViewScale(1.234, STAGE)).toBeCloseTo(1.234, 9);
      expect(clampViewScale(Number.NaN, STAGE)).toBeCloseTo(0.25, 9);
    });
  });

  describe("平移夹取", () => {
    test("画面比舞台小：居中", () => {
      const view = { scale: 0.25, panX: -400, panY: 500 };
      // 480×270 的画面放进 960×540 → 居中
      expect(clampViewPan(view, STAGE)).toEqual({
        scale: 0.25,
        panX: 240,
        panY: 135,
      });
    });

    test("画面比舞台大：夹在 [舞台−画面, 0]，不许露白", () => {
      const view = { scale: 1, panX: 300, panY: -2000 };
      expect(clampViewPan(view, STAGE)).toEqual({
        scale: 1,
        panX: 0,
        panY: -540,
      });
    });

    test("clampView = 先夹比例再夹平移", () => {
      const view = clampView({ scale: 99, panX: 1234, panY: -9999 }, STAGE);
      expect(view.scale).toBe(4);
      expect(view.panX).toBe(0);
      // 400% 时画面高 4320，舞台 540 → panY 下限 = 540 − 4320
      expect(view.panY).toBe(STAGE.height - 4 * 1080);
    });
  });

  describe("以锚点缩放", () => {
    test("锚点下的画面内容保持不动", () => {
      const view = { scale: 0.5, panX: 0, panY: 0 };
      const anchor = { x: 300, y: 200 };
      const before = cssToFrame(view, anchor.x, anchor.y);

      const zoomed = zoomViewAt(view, 1.5, anchor.x, anchor.y);
      const after = cssToFrame(zoomed, anchor.x, anchor.y);

      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      expect(zoomed.scale).toBeCloseTo(1.5, 9);
    });

    test("非法比例原样返回", () => {
      const view = { scale: 0.5, panX: 10, panY: 20 };
      expect(zoomViewAt(view, 0, 1, 2)).toBe(view);
      expect(zoomViewAt(view, Number.NaN, 1, 2)).toBe(view);
    });
  });

  describe("坐标换算", () => {
    test("画面 ↔ 舞台往返一致", () => {
      const view = { scale: 1.75, panX: -320, panY: -180 };
      const css = frameToCss(view, 700, 400);
      const frame = cssToFrame(view, css.x, css.y);
      expect(frame.x).toBeCloseTo(700, 9);
      expect(frame.y).toBeCloseTo(400, 9);
    });

    test("scale 为 0 时不产生 NaN（防御）", () => {
      const point = cssToFrame({ scale: 0, panX: 0, panY: 0 }, 100, 50);
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    });
  });

  describe("比例的文字表示与输入", () => {
    test("显示到 0.1 级", () => {
      expect(zoomPercent(0.5)).toBe(50);
      expect(formatZoomPercent(0.5)).toBe("50%");
      expect(formatZoomPercent(0.5731)).toBe("57.3%");
      expect(formatZoomPercent(1)).toBe("100%");
      expect(formatZoomPercent(4)).toBe("400%");
    });

    test("解析用户输入：百分数 / 百分号 / 倍率", () => {
      expect(parseZoomPercent("150")).toBe(1.5);
      expect(parseZoomPercent("150%")).toBe(1.5);
      expect(parseZoomPercent(" 37.5 % ")).toBe(0.375);
      expect(parseZoomPercent("1.5x")).toBe(1.5);
      expect(parseZoomPercent("2×")).toBe(2);
      expect(parseZoomPercent("0.25")).toBe(0.0025);
    });

    test("解析不出来返回 null", () => {
      expect(parseZoomPercent("")).toBeNull();
      expect(parseZoomPercent("abc")).toBeNull();
      expect(parseZoomPercent("0")).toBeNull();
      expect(parseZoomPercent("-50")).toBeNull();
      expect(parseZoomPercent("12 34")).toBeNull();
    });
  });

  describe("滚轮", () => {
    test("标准鼠标一格（deltaY=100）约 10%，方向正确", () => {
      expect(wheelZoomFactor(-100)).toBeCloseTo(Math.exp(0.1), 6);
      expect(wheelZoomFactor(-100)).toBeGreaterThan(1.09);
      expect(wheelZoomFactor(-100)).toBeLessThan(1.11);
      expect(wheelZoomFactor(100)).toBeLessThan(1);
    });

    test("触控板小增量也响应（不会被截断成 0）", () => {
      const small = wheelZoomFactor(-4);
      expect(small).toBeGreaterThan(1);
      expect(small).toBeLessThan(1.01);
    });

    test("一次滚太大也夹在 [0.5, 2]", () => {
      expect(wheelZoomFactor(-5000)).toBeCloseTo(2, 9);
      expect(wheelZoomFactor(5000)).toBeCloseTo(0.5, 9);
    });

    test("行 / 页模式的 delta 归一成像素", () => {
      expect(normalizeWheelDelta(3, 1)).toBe(48);
      expect(normalizeWheelDelta(1, 2)).toBe(400);
      expect(normalizeWheelDelta(100, 0)).toBe(100);
      expect(normalizeWheelDelta(Number.NaN, 0)).toBe(0);
    });

    test("按钮步进是 1.1（与需求 1.05~1.1 一致）", () => {
      expect(VIEW_ZOOM_STEP).toBeCloseTo(1.1, 9);
    });
  });
});
