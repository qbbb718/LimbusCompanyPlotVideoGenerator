/**
 * 序列帧动画预览的**查看视图**（缩放 + 平移）几何测试。
 *
 * 锁五条（都是这轮需求的验收点）：
 * 1. 初始 / 复位 = 适应窗口（100%），缩放夹在 100%~400%；
 * 2. 舞台显示尺寸严格 = 适应尺寸 × 缩放倍数（百分比叠加层因此永远对齐）；
 * 3. 画面还没铺满视口的轴强制居中，铺满之后不许拖出空白（pan 夹在 ±(显示−视口)/2）；
 * 4. 以锚点缩放时，锚点下面的舞台点**不动**（滚轮缩放不会让细节跑掉）；
 * 5. 以视口中心缩放时，画面中心的内容留在中心（按钮 / 输入框的交互）。
 */
import {
  VIEW_ZOOM_MAX,
  VIEW_ZOOM_MIN,
  clampView,
  clampViewPan,
  clampViewZoom,
  fitView,
  maxViewPan,
  panViewBy,
  viewStageSize,
  zoomViewAt,
  zoomViewToCenter,
  type PreviewView,
} from "./spritePreviewView";

/** 适应窗口后的舞台（16:9） */
const BASE = { width: 640, height: 360 };
/** 视口:左右各留 80px、上下各留 45px */
const VIEWPORT = { width: 800, height: 450 };

/** 舞台上的点 p 在屏幕（相对视口左上角）上的位置 */
const screenOf = (
  view: PreviewView,
  point: { x: number; y: number },
  base = BASE,
  viewport = VIEWPORT,
) => ({
  x: (viewport.width - base.width * view.zoom) / 2 + view.panX + point.x * view.zoom,
  y: (viewport.height - base.height * view.zoom) / 2 + view.panY + point.y * view.zoom,
});

describe("序列帧预览：查看视图", () => {
  describe("缩放与初始状态", () => {
    test("初始 = 适应窗口：100%、不平移", () => {
      expect(fitView()).toEqual({ zoom: VIEW_ZOOM_MIN, panX: 0, panY: 0 });
      expect(viewStageSize(BASE, 1)).toEqual(BASE);
    });

    test("缩放夹在 100% ~ 400%，非数字按 100%", () => {
      expect(clampViewZoom(0.2)).toBe(VIEW_ZOOM_MIN);
      expect(clampViewZoom(99)).toBe(VIEW_ZOOM_MAX);
      expect(clampViewZoom(2.5)).toBeCloseTo(2.5, 9);
      expect(clampViewZoom(Number.NaN)).toBe(VIEW_ZOOM_MIN);
    });

    test("显示尺寸 = 适应尺寸 × 倍数（百分比坐标系不会漂）", () => {
      expect(viewStageSize(BASE, 2)).toEqual({ width: 1280, height: 720 });
      expect(viewStageSize(BASE, 4)).toEqual({ width: 2560, height: 1440 });
      // 异常倍数退回 100%，避免 0 尺寸舞台
      expect(viewStageSize(BASE, 0)).toEqual(BASE);
      expect(viewStageSize(BASE, Number.NaN)).toEqual(BASE);
    });
  });

  describe("平移边界", () => {
    test("还没铺满的轴平移上限是 0（必须居中）", () => {
      expect(maxViewPan(BASE, VIEWPORT, 1)).toEqual({ x: 0, y: 0 });
      // 200% 时两个轴都超出视口
      expect(maxViewPan(BASE, VIEWPORT, 2)).toEqual({ x: 240, y: 135 });
      expect(maxViewPan(BASE, VIEWPORT, 4)).toEqual({ x: 880, y: 495 });
    });

    test("只超出横轴的视口：纵向仍居中", () => {
      const wide = { width: 2000, height: 450 };
      expect(maxViewPan(BASE, wide, 2)).toEqual({ x: 0, y: 135 });
    });

    test("夹平移：适合的轴回中，放大的轴夹在边缘", () => {
      expect(clampViewPan({ zoom: 1, panX: 50, panY: -20 }, BASE, VIEWPORT)).toEqual({
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      expect(clampViewPan({ zoom: 2, panX: 999, panY: -999 }, BASE, VIEWPORT)).toEqual({
        zoom: 2,
        panX: 240,
        panY: -135,
      });
    });

    test("clampView = 先夹缩放再夹平移", () => {
      expect(clampView({ zoom: 99, panX: 1234, panY: -9999 }, BASE, VIEWPORT)).toEqual({
        zoom: 4,
        panX: 880,
        panY: -495,
      });
    });

    test("拖拽平移：按位移累加并夹边界；非法位移原样返回", () => {
      expect(panViewBy({ zoom: 2, panX: 0, panY: 0 }, BASE, VIEWPORT, 300, -40)).toEqual({
        zoom: 2,
        panX: 240,
        panY: -40,
      });
      const view: PreviewView = { zoom: 2, panX: 10, panY: 20 };
      expect(panViewBy(view, BASE, VIEWPORT, Number.NaN, 5)).toBe(view);
    });
  });

  describe("锚点缩放", () => {
    test("滚轮锚点下面的舞台点保持不动", () => {
      const before: PreviewView = { zoom: 2, panX: 0, panY: 0 };
      const anchor = { x: 600, y: 300 };
      // 锚点对应舞台上的点（由 before 的几何反推）
      const p = {
        x: (anchor.x - (VIEWPORT.width - BASE.width * before.zoom) / 2 - before.panX) / before.zoom,
        y: (anchor.y - (VIEWPORT.height - BASE.height * before.zoom) / 2 - before.panY) / before.zoom,
      };

      const after = zoomViewAt(before, 3, anchor, BASE, VIEWPORT);

      expect(after.zoom).toBe(3);
      expect(screenOf(after, p).x).toBeCloseTo(anchor.x, 6);
      expect(screenOf(after, p).y).toBeCloseTo(anchor.y, 6);
    });

    test("锚点在画面边缘时，平移夹取优先（宁可锚点偏移也不露白）", () => {
      const after = zoomViewAt({ zoom: 1, panX: 0, panY: 0 }, 4, { x: 0, y: 0 }, BASE, VIEWPORT);
      expect(after).toEqual({ zoom: 4, panX: 880, panY: 495 });
      // 舞台左上角正好落在视口左上角：没有空白
      const left = (VIEWPORT.width - BASE.width * 4) / 2 + after.panX;
      const top = (VIEWPORT.height - BASE.height * 4) / 2 + after.panY;
      expect(left).toBeCloseTo(0, 6);
      expect(top).toBeCloseTo(0, 6);
    });

    test("超出上限的缩放先夹到 400%", () => {
      expect(zoomViewAt({ zoom: 1, panX: 0, panY: 0 }, 99, { x: 400, y: 225 }, BASE, VIEWPORT))
        .toEqual({ zoom: 4, panX: 0, panY: 0 });
    });

    test("视口中心缩放：画面中心的内容留在中心", () => {
      const center = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
      const p = {
        x: (center.x - (VIEWPORT.width - BASE.width) / 2) / 1,
        y: (center.y - (VIEWPORT.height - BASE.height) / 2) / 1,
      };
      const after = zoomViewToCenter({ zoom: 1, panX: 0, panY: 0 }, 2, BASE, VIEWPORT);
      expect(screenOf(after, p).x).toBeCloseTo(center.x, 6);
      expect(screenOf(after, p).y).toBeCloseTo(center.y, 6);
    });

    test("量不到舞台/视口时只改缩放，不产生假平移", () => {
      expect(zoomViewAt({ zoom: 1, panX: 30, panY: 40 }, 2, { x: 10, y: 10 }, { width: 0, height: 0 }, VIEWPORT))
        .toEqual({ zoom: 2, panX: 0, panY: 0 });
      expect(zoomViewToCenter({ zoom: 1, panX: 0, panY: 0 }, 2, BASE, { width: 0, height: 0 }))
        .toEqual({ zoom: 2, panX: 0, panY: 0 });
    });
  });
});
