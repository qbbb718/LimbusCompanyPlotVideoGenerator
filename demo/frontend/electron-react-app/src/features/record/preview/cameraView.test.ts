/**
 * 摄像机模式纯运算单测。
 *
 * 这里锁三件事：
 * 1. 镜头（进记录、影响成片）与视图（只看，不影响成片）是两套缩放；
 * 2. 推拉以指针为锚点，指针下的内容不会"跑"；
 * 3. 镜头被夹在世界框里，摇到极限时世界正好完全出画。
 */
import {
  IDENTITY_CAMERA,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  DEFAULT_CAMERA_EASING,
  cameraAt,
  cameraKeyframe,
  cameraMoveFrames,
  cameraProgressOf,
  cameraRectOf,
  coverScaleForBackground,
  cssToWorld,
  easeProgress,
  fitScale,
  isAnimatedCamera,
  isIdentityCamera,
  moveCameraBy,
  normalizeCamera,
  viewTransformOf,
  withKeyframe,
  zoomCameraAt,
  zoomViewAt,
} from "./cameraView";
import { worldBoxOf, CANVAS_WORLD_RECT } from "./previewLayout";
import type { BackgroundVisual } from "@types";

const WORLD_BOX = worldBoxOf(CANVAS_WORLD_RECT); // 画布 ± 一帧余地

describe("镜头归一化", () => {
  test("缺省 / 非法值回落到 960,540,1", () => {
    expect(normalizeCamera(undefined)).toEqual(IDENTITY_CAMERA);
    expect(normalizeCamera({ centerX: NaN, centerY: 540, zoom: 0 } as any)).toEqual({
      centerX: 960,
      centerY: 540,
      zoom: 1,
    });
  });

  test("zoom 收敛到 [0.5, 4]（与后端 Camera 一致）", () => {
    expect(normalizeCamera({ centerX: 960, centerY: 540, zoom: 99 }).zoom).toBe(4);
    expect(normalizeCamera({ centerX: 960, centerY: 540, zoom: 0.01 }).zoom).toBe(0.5);
  });

  test("恒等判定", () => {
    expect(isIdentityCamera(undefined)).toBe(true);
    expect(isIdentityCamera({ centerX: 960, centerY: 540, zoom: 1 })).toBe(true);
    expect(isIdentityCamera({ centerX: 1200, centerY: 540, zoom: 1 })).toBe(false);
    expect(isIdentityCamera({ centerX: 960, centerY: 540, zoom: 1.5 })).toBe(false);
  });
});

describe("取景框", () => {
  test("zoom=1 时正好是整块画布", () => {
    expect(cameraRectOf(IDENTITY_CAMERA)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  test("zoom=2 时缩到一半、围绕中心", () => {
    expect(cameraRectOf({ centerX: 960, centerY: 540, zoom: 2 })).toEqual({
      x: 480,
      y: 270,
      w: 960,
      h: 540,
    });
  });

  test("平移中心，取景框跟着走", () => {
    expect(cameraRectOf({ centerX: 1200, centerY: 600, zoom: 1 })).toEqual({
      x: 240,
      y: 60,
      w: 1920,
      h: 1080,
    });
  });
});

describe("视图变换", () => {
  test("适配：世界框刚好放进舞台", () => {
    const stage = { width: 1000, height: 500 };
    const transform = viewTransformOf(stage, WORLD_BOX, 1, { x: 0, y: 0 });
    expect(transform.scale).toBeCloseTo(fitScale(stage, WORLD_BOX));
    // 世界框居中
    expect(transform.left).toBeCloseTo((1000 - transform.width) / 2);
    expect(transform.top).toBeCloseTo((500 - transform.height) / 2);
  });

  test("视图缩放 2× → 世界框在舞台里的大小翻倍", () => {
    const stage = { width: 1000, height: 500 };
    const a = viewTransformOf(stage, WORLD_BOX, 1, { x: 0, y: 0 });
    const b = viewTransformOf(stage, WORLD_BOX, 2, { x: 0, y: 0 });
    expect(b.width).toBeCloseTo(a.width * 2);
    expect(b.scale).toBeCloseTo(a.scale * 2);
  });

  test("视图缩放范围被夹住", () => {
    const stage = { width: 1000, height: 500 };
    expect(viewTransformOf(stage, WORLD_BOX, 99, { x: 0, y: 0 }).scale).toBeCloseTo(
      fitScale(stage, WORLD_BOX) * MAX_VIEW_ZOOM,
    );
    expect(viewTransformOf(stage, WORLD_BOX, 0.01, { x: 0, y: 0 }).scale).toBeCloseTo(
      fitScale(stage, WORLD_BOX) * MIN_VIEW_ZOOM,
    );
  });

  test("CSS 坐标 ↔ 世界坐标可以来回换算", () => {
    const stage = { width: 800, height: 600 };
    const transform = viewTransformOf(stage, WORLD_BOX, 1, { x: 0, y: 0 });
    const world = cssToWorld({ x: 400, y: 300 }, transform, WORLD_BOX);
    expect(world.x).toBeCloseTo((WORLD_BOX.x + WORLD_BOX.x + WORLD_BOX.w) / 2);
    expect(world.y).toBeCloseTo((WORLD_BOX.y + WORLD_BOX.y + WORLD_BOX.h) / 2);
  });
});

describe("移镜与推拉", () => {
  test("按世界位移平移镜头", () => {
    const moved = moveCameraBy(IDENTITY_CAMERA, { x: 100, y: -50 }, WORLD_BOX);
    expect(moved.centerX).toBeCloseTo(1060);
    expect(moved.centerY).toBeCloseTo(490);
  });

  test("镜头被夹在世界框内：摇到极限时世界正好完全出画", () => {
    const moved = moveCameraBy(IDENTITY_CAMERA, { x: 999999, y: 0 }, WORLD_BOX);
    // 取景框右边缘贴住世界框右边缘
    const rect = cameraRectOf(moved);
    expect(rect.x + rect.w).toBeCloseTo(WORLD_BOX.x + WORLD_BOX.w);
  });

  test("推拉以锚点为基准：锚点在画面里的相对位置不变", () => {
    const anchor = { x: 1200, y: 700 };
    const before = cameraRectOf(IDENTITY_CAMERA);
    const rx = (anchor.x - before.x) / before.w;
    const ry = (anchor.y - before.y) / before.h;

    const zoomed = zoomCameraAt(IDENTITY_CAMERA, 2, anchor, WORLD_BOX);
    const after = cameraRectOf(zoomed);
    expect(zoomed.zoom).toBe(2);
    expect((anchor.x - after.x) / after.w).toBeCloseTo(rx);
    expect((anchor.y - after.y) / after.h).toBeCloseTo(ry);
  });

  test("推拉超出范围时按 0.5 / 4 夹住", () => {
    expect(zoomCameraAt(IDENTITY_CAMERA, 100, { x: 960, y: 540 }, WORLD_BOX).zoom).toBe(4);
    expect(zoomCameraAt(IDENTITY_CAMERA, 0.01, { x: 960, y: 540 }, WORLD_BOX).zoom).toBe(0.5);
  });
});

describe("视图缩放（Ctrl+滚轮）", () => {
  test("指针下的世界点保持不动", () => {
    const stage = { width: 900, height: 500 };
    const point = { x: 700, y: 150 };
    const before = viewTransformOf(stage, WORLD_BOX, 1, { x: 0, y: 0 });
    const worldBefore = cssToWorld(point, before, WORLD_BOX);

    const next = zoomViewAt(point, stage, WORLD_BOX, 1, { x: 0, y: 0 }, 2);
    const after = viewTransformOf(stage, WORLD_BOX, next.viewZoom, next.pan);
    const worldAfter = cssToWorld(point, after, WORLD_BOX);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });
});

describe("铺满背景", () => {
  const makeBg = () => ({ background: { path: "b.png" } } as unknown as BackgroundVisual);

  test("16:9 背景在 zoom=1 时本来就铺满，scale=1", () => {
    const scale = coverScaleForBackground(makeBg(), { width: 1920, height: 1080 }, IDENTITY_CAMERA);
    expect(scale).toBeCloseTo(1, 3);
  });

  test("30:9 横长背景要放大到 1.875 才能盖住取景框", () => {
    const scale = coverScaleForBackground(makeBg(), { width: 3600, height: 1080 }, IDENTITY_CAMERA);
    expect(scale).toBeCloseTo(1.875, 3);
  });

  test("背景本来就比取景框大时不缩小（保持 1，避免「铺满」把世界变小）", () => {
    const atOne = coverScaleForBackground(makeBg(), { width: 1920, height: 1080 }, IDENTITY_CAMERA);
    const zoomed = coverScaleForBackground(makeBg(), { width: 1920, height: 1080 }, {
      centerX: 960,
      centerY: 540,
      zoom: 2,
    });
    expect(atOne).toBeCloseTo(1, 3);
    expect(zoomed).toBeCloseTo(1, 3);
  });

  test("结果夹在后端支持的范围 [0.1, 4]（背景上限比立绘大，竖图才能铺满）", () => {
    const huge = coverScaleForBackground(makeBg(), { width: 3840, height: 2160 }, IDENTITY_CAMERA);
    expect(huge).toBeLessThanOrEqual(4);
    expect(huge).toBeGreaterThanOrEqual(0.1);
  });

  test("9:16 竖图按 3.16 倍铺满，不再被 3.0 卡住", () => {
    // 1920×1080 的取景框 / 1080×1920 的竖图：宽度需要 16/9 ≈ 1.778 倍于"高度铺满"的 3.16？直接算：
    // scale=1 时 contain 画成 607.5×1080，盖住 1920 宽需要 1920/607.5 ≈ 3.16
    const scale = coverScaleForBackground(makeBg(), { width: 1080, height: 1920 }, IDENTITY_CAMERA);
    expect(scale).toBeGreaterThan(3);
    expect(scale).toBeLessThanOrEqual(4);
    expect(scale).toBeCloseTo(1920 / 607.5, 2);
  });
});
describe("起止镜头（C2）", () => {
  const animated = {
    centerX: 960,
    centerY: 540,
    zoom: 1,
    to: { centerX: 1400, centerY: 700, zoom: 2 },
    easing: "linear" as const,
  };

  test("缓动曲线：与后端 Camera.ease 同一套三次曲线", () => {
    expect(easeProgress(0.5, "linear")).toBeCloseTo(0.5);
    expect(easeProgress(0.5, "easeIn")).toBeCloseTo(0.125);
    expect(easeProgress(0.5, "easeOut")).toBeCloseTo(0.875);
    expect(easeProgress(0.5, "easeInOut")).toBeCloseTo(0.5);
    expect(easeProgress(0.25, "easeInOut")).toBeCloseTo(4 * 0.25 ** 3);
    expect(easeProgress(-1, "linear")).toBe(0);
    expect(easeProgress(2, "easeIn")).toBe(1);
  });

  test("cameraAt：t=0 是起点、t=1 是终点、t=0.5 是中间值", () => {
    expect(cameraAt(animated, 0)).toMatchObject({ centerX: 960, centerY: 540, zoom: 1 });
    expect(cameraAt(animated, 1)).toMatchObject({ centerX: 1400, centerY: 700, zoom: 2 });
    // 匀速下 t=0.5 → 取景中心与缩放都是两点的中点
    expect(cameraAt(animated, 0.5).centerX).toBeCloseTo(1180);
    expect(cameraAt(animated, 0.5).zoom).toBeCloseTo(1.5);
  });

  test("缓动会改变中间帧", () => {
    const eased = { ...animated, easing: "easeIn" as const };
    // easeIn 在 t=0.5 只走了 12.5%
    expect(cameraAt(eased, 0.5).centerX).toBeCloseTo(960 + 440 * 0.125);
  });

  test("静止镜头（没有 to / to 与起点相同）不参与动画", () => {
    expect(isAnimatedCamera(undefined)).toBe(false);
    expect(isAnimatedCamera(IDENTITY_CAMERA)).toBe(false);
    expect(isAnimatedCamera({ ...IDENTITY_CAMERA, to: { ...IDENTITY_CAMERA } })).toBe(false);
    expect(isAnimatedCamera(animated)).toBe(true);
    // 静止镜头 cameraAt 恒等于起点
    expect(cameraAt({ centerX: 1200, centerY: 540, zoom: 1 }, 1)).toMatchObject({ centerX: 1200 });
  });

  test("cameraKeyframe：终点缺省时等同于起点", () => {
    expect(cameraKeyframe(animated, "start")).toMatchObject({ centerX: 960, zoom: 1 });
    expect(cameraKeyframe(animated, "end")).toMatchObject({ centerX: 1400, zoom: 2 });
    expect(cameraKeyframe(IDENTITY_CAMERA, "end")).toMatchObject({ centerX: 960, zoom: 1 });
  });

  test("withKeyframe：写终点会保留起点与缓动，写起点不会冲掉终点", () => {
    const toEnd = withKeyframe(IDENTITY_CAMERA, "end", { centerX: 1300, centerY: 600, zoom: 1.5 });
    expect(toEnd).toMatchObject({ centerX: 960, centerY: 540, zoom: 1 });
    expect(toEnd.to).toMatchObject({ centerX: 1300, centerY: 600, zoom: 1.5 });

    const toStart = withKeyframe(animated, "start", { centerX: 1000, centerY: 500, zoom: 1.2 });
    expect(toStart).toMatchObject({ centerX: 1000, centerY: 500, zoom: 1.2 });
    expect(toStart.to).toMatchObject({ centerX: 1400, zoom: 2 });
    expect(toStart.easing).toBe("linear");
  });

  test("归一化不会丢掉 to / easing", () => {
    const normalized = normalizeCamera({
      centerX: 0,
      centerY: 0,
      zoom: 99,
      to: { centerX: 500, centerY: 500, zoom: 0 },
      easing: "easeOut",
    });
    expect(normalized.zoom).toBe(4); // 上限
    expect(normalized.to).toMatchObject({ centerX: 500, centerY: 500, zoom: 1 }); // zoom<=0 当 1
    expect(normalized.easing).toBe("easeOut");
  });
});
describe("运镜时长（moveFrames，默认 24 帧）", () => {
  const animated = {
    centerX: 960,
    centerY: 540,
    zoom: 1,
    to: { centerX: 1400, centerY: 540, zoom: 1 },
    easing: "linear" as const,
  };

  test("缺省 / 非法值一律回退 24", () => {
    expect(cameraMoveFrames(undefined)).toBe(24);
    expect(cameraMoveFrames({} as any)).toBe(24);
    expect(cameraMoveFrames({ ...animated, moveFrames: 0 })).toBe(24);
    expect(cameraMoveFrames({ ...animated, moveFrames: -3 })).toBe(24);
    expect(cameraMoveFrames({ ...animated, moveFrames: Number.NaN })).toBe(24);
    expect(cameraMoveFrames({ ...animated, moveFrames: 12 })).toBe(12);
    // 小数四舍五入成整数帧
    expect(cameraMoveFrames({ ...animated, moveFrames: 12.6 })).toBe(13);
  });

  test("进度：24 帧内走完，之后停在 1", () => {
    expect(cameraProgressOf(0, 24)).toBe(0);
    expect(cameraProgressOf(11, 24)).toBeCloseTo(11 / 23);
    expect(cameraProgressOf(23, 24)).toBe(1);
    expect(cameraProgressOf(999, 24)).toBe(1);
  });

  test("进度：1 帧时立刻到终点", () => {
    expect(cameraProgressOf(0, 1)).toBe(0);
    expect(cameraProgressOf(1, 1)).toBe(1);
  });

  test("同一帧序下，运镜时长越短进度越快（预览与成片同一套公式）", () => {
    expect(cameraProgressOf(6, 24)).toBeLessThan(cameraProgressOf(6, 12));
    expect(cameraProgressOf(6, 12)).toBeCloseTo(6 / 11);
  });

  test("cameraAt 按进度求值：24 帧的第 12 帧约走到一半", () => {
    const mid = cameraAt(animated, cameraProgressOf(12, 24));
    expect(mid.centerX).toBeGreaterThan(960);
    expect(mid.centerX).toBeLessThan(1400);
  });

  test("归一化保留 moveFrames，写帧时不会丢", () => {
    const normalized = normalizeCamera({ ...animated, moveFrames: 36 });
    expect(normalized.moveFrames).toBe(36);
    const edited = withKeyframe(normalized, "end", { centerX: 1500, centerY: 540, zoom: 1 });
    expect(edited.moveFrames).toBe(36);
    // 没有 to 的静止镜头不写 moveFrames
    expect(normalizeCamera({ centerX: 1200, centerY: 540, zoom: 1 }).moveFrames).toBeUndefined();
  });
});
describe("默认缓动 = 慢出（easeOut）", () => {
  test("常量就是 easeOut", () => {
    expect(DEFAULT_CAMERA_EASING).toBe("easeOut");
  });

  test("拖出终点（第一次生成 to）时默认用慢出", () => {
    const created = withKeyframe(IDENTITY_CAMERA, "end", {
      centerX: 1300,
      centerY: 540,
      zoom: 1.5,
    });
    expect(created.easing).toBe("easeOut");
  });

  test("有 to 但没写 easing 的旧数据，归一化也按慢出", () => {
    const normalized = normalizeCamera({
      centerX: 960,
      centerY: 540,
      zoom: 1,
      to: { centerX: 1200, centerY: 540, zoom: 1 },
    });
    expect(normalized.easing).toBe("easeOut");
    // 中间帧按慢出：t=0.5 已走过 87.5%
    expect(cameraAt(normalized, 0.5).centerX).toBeCloseTo(960 + 240 * 0.875);
  });

  test("显式写了 linear 的老数据保持匀速", () => {
    const normalized = normalizeCamera({
      centerX: 960,
      centerY: 540,
      zoom: 1,
      to: { centerX: 1200, centerY: 540, zoom: 1 },
      easing: "linear",
    });
    expect(normalized.easing).toBe("linear");
    expect(cameraAt(normalized, 0.5).centerX).toBeCloseTo(1080);
  });
});
