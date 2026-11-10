import { transformImage } from "react-advanced-cropper";
import { keepStencilImageRect } from "./keepStencilImageRect";

// 测试只关心"操作后裁剪框有没有被还原"，库的 transformImage 用假的返回值即可
jest.mock("react-advanced-cropper", () => ({
  transformImage: jest.fn(),
  // 与库里一致：state 初始化过 = boundary / visibleArea / coordinates 都在
  isInitializedState: (state: any) =>
    Boolean(state?.visibleArea && state?.coordinates),
}));

const transformImageMock = transformImage as jest.MockedFunction<
  typeof transformImage
>;

/** 一张 560×1476 立绘在 390×500 画布里的状态（数值取自实际运行时的裁剪器） */
const createState = () => ({
  boundary: { width: 390, height: 500 },
  imageSize: { width: 560, height: 1476 },
  visibleArea: {
    left: -295.64,
    top: 0,
    width: 1151.28,
    height: 1476,
  },
  coordinates: { left: 155, top: 13, width: 168, height: 168 },
  transforms: { rotate: 0, flip: { horizontal: false, vertical: false } },
});

/** 库默认算出来的"缩放后"状态：框被缩小、位置也被挪了 */
const createZoomedState = () => ({
  ...createState(),
  visibleArea: {
    left: -243.31,
    top: 8.72,
    width: 1046.62,
    height: 1341.82,
  },
  coordinates: { left: 166.36, top: 20.54, width: 152.73, height: 152.73 },
});

describe("立绘裁剪器：缩放 / 平移时裁剪框跟着立绘走", () => {
  beforeEach(() => {
    transformImageMock.mockReset();
  });

  test("滚轮缩放后裁剪框保留原图像素矩形（不再被库缩小 / 挪走）", () => {
    const zoomed = createZoomedState();
    transformImageMock.mockReturnValue(zoomed as any);

    const next = keepStencilImageRect(
      createState() as any,
      {} as any,
      { scale: { factor: 1.1, center: { left: 238.67, top: 95.94 } } } as any,
    );

    // 尺寸和位置都是缩放前的值：框和立绘保持相对位置
    expect(next.coordinates).toEqual({
      left: 155,
      top: 13,
      width: 168,
      height: 168,
    });
    // 返回新对象，不去改库算出来的 state
    expect(next).not.toBe(zoomed);
  });

  test("拖动立绘平移后同样保留原图像素矩形（不会被夹回可见区域）", () => {
    // 库的默认平移会把框夹进可见区域（这里模拟成被挪到 200, 40）
    const movedByLibrary = {
      ...createZoomedState(),
      coordinates: { left: 200, top: 40, width: 168, height: 168 },
    };
    transformImageMock.mockReturnValue(movedByLibrary as any);

    const next = keepStencilImageRect(
      createState() as any,
      {} as any,
      { move: { left: 12, top: -8 } } as any,
    );

    expect(next.coordinates).toEqual({
      left: 155,
      top: 13,
      width: 168,
      height: 168,
    });
    expect(next).not.toBe(movedByLibrary);
  });

  test("旋转 / 翻转仍按库的默认规则调框", () => {
    const rotated = createZoomedState();
    transformImageMock.mockReturnValue(rotated as any);

    const next = keepStencilImageRect(
      createState() as any,
      {} as any,
      { rotate: { angle: 15 } } as any,
    );

    expect(next).toBe(rotated);
  });

  test("裁剪器还没初始化（图片没读进来）时直接返回库的结果", () => {
    const notReady = { ...createZoomedState(), coordinates: null };
    transformImageMock.mockReturnValue(notReady as any);

    const next = keepStencilImageRect(
      { ...createState(), coordinates: null } as any,
      {} as any,
      { scale: { factor: 1.1 } } as any,
    );

    expect(next).toBe(notReady);
  });

  test("库返回空状态时不抛错", () => {
    transformImageMock.mockReturnValue(null as any);

    const next = keepStencilImageRect(
      createState() as any,
      {} as any,
      { scale: { factor: 1.1 } } as any,
    );

    expect(next).toBeNull();
  });
});
