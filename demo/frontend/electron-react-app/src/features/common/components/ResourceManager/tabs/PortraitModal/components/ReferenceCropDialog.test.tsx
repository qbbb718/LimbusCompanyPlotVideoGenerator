import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadImageElement } from "@features/common/utils/imageUtils";
import ReferenceCropDialog from "./ReferenceCropDialog";

jest.mock("@features/common/utils/imageUtils", () => ({
  __esModule: true,
  loadImageElement: jest.fn(),
}));

const loadImageElementMock = loadImageElement as unknown as jest.Mock;

/** 立绘：1600×2432；截图：2560×1440（16:9）；名字带 wide 的故意给 16:10 */
const mockImageSize = (src: string) => {
  if (src.includes("wide")) {
    return Promise.resolve({ naturalWidth: 1920, naturalHeight: 1200 });
  }
  if (src.startsWith("blob:")) {
    return Promise.resolve({ naturalWidth: 2560, naturalHeight: 1440 });
  }
  return Promise.resolve({ naturalWidth: 1600, naturalHeight: 2432 });
};

const makeScreenshotFile = () =>
  new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

/**
 * jsdom 不做布局：舞台量出来永远是 0，那"适应窗口"就算不出来。
 * 这里给一个固定的 960×540 舞台（刚好 16:9），于是 fit = 960/1920 = 50%。
 */
const STAGE_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width: 960,
  height: 540,
  right: 960,
  bottom: 540,
  toJSON: () => ({}),
} as DOMRect;

/**
 * jsdom 没有 PointerEvent：RTL 会退化成普通 Event，`clientX / button` 全丢，
 * React 的合成事件也就读不到（拖动会算出 NaN）。这里补一个最小实现。
 */
class PointerEventPolyfill extends MouseEvent {
  public pointerId: number;
  public pointerType: string;
  public isPrimary: boolean;

  constructor(type: string, params: Record<string, unknown> = {}) {
    super(type, params as MouseEventInit);
    this.pointerId = Number(params.pointerId ?? 0);
    this.pointerType = String(params.pointerType ?? "mouse");
    this.isPrimary = params.isPrimary !== false;
  }
}

/**
 * 「按截图反推裁剪框」弹窗：
 * - 没选截图前不能写回；
 * - 打开时以"当前裁剪"为初始对齐，什么都不拖直接写回必须原样返回；
 * - 缩放后写回的 length 按 146.4 / S 变化；
 * - 16:9 之外给出提示，但仍然可以对齐；
 * - 查看视图（缩放/平移）只影响看，不影响写回结果。
 */
describe("按截图反推裁剪框", () => {
  const CURRENT_CROP = { faceX: 568, faceY: 40, length: 400 };

  beforeAll(() => {
    (window as any).PointerEvent = PointerEventPolyfill;
    (URL as any).createObjectURL = jest.fn(() => "blob:screenshot");
    (URL as any).revokeObjectURL = jest.fn();
    // jsdom 没有指针捕获
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
    Element.prototype.hasPointerCapture = jest.fn(() => false);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(STAGE_RECT);
    (URL as any).createObjectURL = jest.fn(() => "blob:screenshot");
    loadImageElementMock.mockImplementation(mockImageSize);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderDialog = (
    overrides: Partial<React.ComponentProps<typeof ReferenceCropDialog>> = {},
  ) => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const utils = render(
      <ReferenceCropDialog
        portraitUrl="data:portrait"
        currentCrop={CURRENT_CROP}
        characterHeight={171}
        onApply={onApply}
        onClose={onClose}
        {...overrides}
      />,
    );
    return { ...utils, onApply, onClose };
  };

  test("没选截图时提示并且不能写回", async () => {
    const { onApply } = renderDialog();

    expect(screen.getByText(/先选一张角色清晰的 16:9 游戏截图/)).toBeTruthy();
    const apply = screen.getByRole("button", { name: "写回裁剪框" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  test("打开时以当前裁剪为初始对齐：不拖动直接写回，结果原样返回", async () => {
    const { onApply } = renderDialog();

    // 等立绘尺寸读完（读数出现 = 反推已经算出来了）
    await screen.findByText("400");

    fireEvent.change(screen.getByTestId("reference-crop-file"), {
      target: { files: [makeScreenshotFile()] },
    });
    expect(await screen.findByText(/2560×1440/)).toBeTruthy();

    const apply = screen.getByRole("button", { name: "写回裁剪框" }) as HTMLButtonElement;
    await waitFor(() => expect(apply.disabled).toBe(false));
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(CURRENT_CROP);
  });

  test("放大 5% 后头框边长按 146.4 / S 缩小", async () => {
    const { onApply } = renderDialog();
    await screen.findByText("400");

    fireEvent.change(screen.getByTestId("reference-crop-file"), {
      target: { files: [makeScreenshotFile()] },
    });
    await screen.findByText(/2560×1440/);

    fireEvent.click(screen.getByRole("button", { name: "放大立绘" }));

    // 400 / 1.05 = 380.95 → 381
    expect(await screen.findByText("381")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "写回裁剪框" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ length: 381 }));
  });

  test("「恢复当前裁剪」把对齐退回打开时的裁剪框", async () => {
    const { onApply } = renderDialog();
    await screen.findByText("400");

    fireEvent.change(screen.getByTestId("reference-crop-file"), {
      target: { files: [makeScreenshotFile()] },
    });
    await screen.findByText(/2560×1440/);

    const viewport = screen.getByRole("application", { name: "截图对齐画布" });
    // 方向键往上微调 10 次（Shift 大步 = 10 帧像素）→ 立绘上移 100 帧像素，
    // 头的竖直中心跟着上移，faceY 多 100 / S（S = 146.4/400 ≈ 0.366）→ 40 + 273 ≈ 313
    for (let i = 0; i < 10; i += 1) {
      fireEvent.keyDown(viewport, { key: "ArrowUp", shiftKey: true });
    }
    expect(await screen.findByText("(568, 313)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "恢复当前裁剪" }));
    expect(await screen.findByText("(568, 40)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "写回裁剪框" }));
    expect(onApply).toHaveBeenCalledWith(CURRENT_CROP);
  });

  test("左右怎么拖都不影响反推结果（水平位置不参与校准）", async () => {
    const { onApply } = renderDialog();
    await screen.findByText("400");

    fireEvent.change(screen.getByTestId("reference-crop-file"), {
      target: { files: [makeScreenshotFile()] },
    });
    await screen.findByText(/2560×1440/);

    const viewport = screen.getByRole("application", { name: "截图对齐画布" });
    for (let i = 0; i < 10; i += 1) {
      fireEvent.keyDown(viewport, { key: "ArrowRight", shiftKey: true });
    }
    // faceX 仍是当前裁剪框中心推出的值：768 − 400/2 = 568
    expect(await screen.findByText("(568, 40)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "写回裁剪框" }));
    expect(onApply).toHaveBeenCalledWith(CURRENT_CROP);
  });

  test("非 16:9 的截图给出提示", async () => {
    (URL as any).createObjectURL = jest.fn(() => "blob:wide");
    renderDialog();
    await screen.findByText("400");

    fireEvent.change(screen.getByTestId("reference-crop-file"), {
      target: { files: [makeScreenshotFile()] },
    });

    expect(await screen.findByText(/不是 16:9/)).toBeTruthy();
  });

  test("竖直靶带按身高摆位；关闭按钮回传 onClose", async () => {
    const { onClose } = renderDialog({ characterHeight: 160 });
    await screen.findByText("400");

    const guide = screen.getByTestId("reference-crop-guide");
    // 身高 160 → anchorY = 221 + 11×12 = 353；成片里 108 + 0.8×353 = 390.4
    expect(parseFloat(guide.style.top)).toBeCloseTo(390.4, 6);
    // 靶带是全宽的：水平位置不参与校准
    expect(guide.style.left).toBe("0px");
    expect(parseFloat(guide.style.height)).toBeCloseTo(146.4, 6);
    expect(screen.getByTestId("reference-crop-guide-center")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "关闭按截图校准" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("Esc 也能关掉", async () => {
    const { onClose } = renderDialog();
    await screen.findByText("400");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * 查看视图缩放 / 平移：只影响"看"，不动任何校准参数。
   * 舞台在 jsdom 里被固定成 960×540，所以"适应窗口"恰好是 50%。
   */
  describe("查看视图缩放 / 平移", () => {
    const zoomInput = () =>
      screen.getByLabelText(/视图缩放比例/) as HTMLInputElement;
    const frameEl = () => screen.getByTestId("reference-crop-frame");
    const stageEl = () =>
      screen.getByRole("application", { name: "截图对齐画布" });

    const typeZoom = async (value: string) => {
      fireEvent.change(zoomInput(), { target: { value } });
      fireEvent.keyDown(zoomInput(), { key: "Enter" });
      await waitFor(() => expect(zoomInput().value).toBe(viewportPercent(value)));
    };

    /** 输入 → 期望显示值（去掉多余的 0，例如 "150" → "150"） */
    const viewportPercent = (value: string) => String(Number(value.replace("%", "")));

    /** 从帧的 transform 里取出缩放倍数（CSS 序列化会有浮点尾巴，不能比字符串） */
    const frameScale = () => {
      const matched = /scale\(([^)]+)\)/.exec(frameEl().style.transform);
      return matched ? Number(matched[1]) : Number.NaN;
    };

    const pickScreenshot = async () => {
      fireEvent.change(screen.getByTestId("reference-crop-file"), {
        target: { files: [makeScreenshotFile()] },
      });
      await screen.findByText(/2560×1440/);
    };

    test("初始是适应窗口：显示 50%，帧的 transform 也是 0.5", async () => {
      renderDialog();
      await screen.findByText("400");

      expect(zoomInput().value).toBe("50");
      expect(frameScale()).toBeCloseTo(0.5, 6);
    });

    test("输入精确比例：150 / 33.3% 都能设到", async () => {
      renderDialog();
      await screen.findByText("400");

      await typeZoom("150");
      expect(frameScale()).toBeCloseTo(1.5, 6);

      fireEvent.change(zoomInput(), { target: { value: "33.3%" } });
      fireEvent.keyDown(zoomInput(), { key: "Enter" });
      await waitFor(() => expect(zoomInput().value).toBe("33.3"));
      expect(frameScale()).toBeCloseTo(0.333, 6);
    });

    test("倍率写法 1.5x = 150%", async () => {
      renderDialog();
      await screen.findByText("400");

      fireEvent.change(zoomInput(), { target: { value: "1.5x" } });
      fireEvent.keyDown(zoomInput(), { key: "Enter" });
      await waitFor(() => expect(zoomInput().value).toBe("150"));
    });

    test("非法输入不改比例", async () => {
      renderDialog();
      await screen.findByText("400");

      fireEvent.change(zoomInput(), { target: { value: "abc" } });
      fireEvent.keyDown(zoomInput(), { key: "Enter" });
      await waitFor(() => expect(zoomInput().value).toBe("50"));
    });

    test("输入框里按 Esc = 放弃输入，且不会把弹窗关掉", async () => {
      const { onClose } = renderDialog();
      await screen.findByText("400");

      fireEvent.focus(zoomInput());
      fireEvent.change(zoomInput(), { target: { value: "250" } });
      fireEvent.keyDown(zoomInput(), { key: "Escape" });

      await waitFor(() => expect(zoomInput().value).toBe("50"));
      expect(frameScale()).toBeCloseTo(0.5, 6);
      expect(onClose).not.toHaveBeenCalled();
    });

    test("按钮 ±10%；1:1 与「适应」一键回到对应比例", async () => {
      renderDialog();
      await screen.findByText("400");

      fireEvent.click(screen.getByRole("button", { name: "放大视图" }));
      await waitFor(() => expect(zoomInput().value).toBe("55"));

      fireEvent.click(screen.getByRole("button", { name: "缩小视图" }));
      await waitFor(() => expect(zoomInput().value).toBe("50"));

      fireEvent.click(screen.getByRole("button", { name: "1:1" }));
      await waitFor(() => expect(zoomInput().value).toBe("100"));
      expect(frameScale()).toBeCloseTo(1, 6);

      fireEvent.click(screen.getByRole("button", { name: "适应" }));
      await waitFor(() => expect(zoomInput().value).toBe("50"));
    });

    test("滚轮以指针为锚点缩放，一格约 10%", async () => {
      renderDialog();
      await screen.findByText("400");

      await act(async () => {
        fireEvent.wheel(stageEl(), {
          deltaY: -100,
          clientX: 480,
          clientY: 270,
        });
        // 等 rAF 把这一帧的滚轮量合进视图
        await new Promise((resolve) => setTimeout(resolve, 40));
      });

      expect(zoomInput().value).toBe("55.3");
      // 锚点是舞台中心：放大后画面中心仍在舞台中心
      expect(frameEl().style.transform).toContain("scale(0.5525");
    });

    test("Alt+滚轮缩放的是立绘（校准），不是视图", async () => {
      renderDialog();
      await screen.findByText("400");

      const before = zoomInput().value;
      fireEvent.wheel(stageEl(), { deltaY: -100, altKey: true });

      // 立绘放大约 3% → length 400 / 1.0305 ≈ 388
      expect(await screen.findByText("388")).toBeTruthy();
      expect(zoomInput().value).toBe(before);
    });

    test("中键拖动平移视图，且写回结果不受影响", async () => {
      const { onApply } = renderDialog();
      await screen.findByText("400");
      await pickScreenshot();

      fireEvent.click(screen.getByRole("button", { name: "1:1" }));
      await waitFor(() => expect(zoomInput().value).toBe("100"));

      fireEvent.pointerDown(stageEl(), {
        button: 1,
        pointerId: 7,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(stageEl(), {
        pointerId: 7,
        clientX: 60,
        clientY: 80,
      });
      fireEvent.pointerUp(stageEl(), {
        pointerId: 7,
        clientX: 60,
        clientY: 80,
      });

      expect(frameEl().style.transform).toBe("translate(-40px, -20px) scale(1)");

      fireEvent.click(screen.getByRole("button", { name: "写回裁剪框" }));
      expect(onApply).toHaveBeenCalledWith(CURRENT_CROP);
    });

    test("空格 + 拖动也能平移", async () => {
      renderDialog();
      await screen.findByText("400");
      fireEvent.click(screen.getByRole("button", { name: "1:1" }));
      await waitFor(() => expect(zoomInput().value).toBe("100"));

      fireEvent.keyDown(window, { code: "Space" });
      fireEvent.pointerDown(stageEl(), {
        button: 0,
        pointerId: 3,
        clientX: 200,
        clientY: 200,
      });
      fireEvent.pointerMove(stageEl(), {
        pointerId: 3,
        clientX: 150,
        clientY: 160,
      });
      fireEvent.pointerUp(stageEl(), {
        pointerId: 3,
        clientX: 150,
        clientY: 160,
      });
      fireEvent.keyUp(window, { code: "Space" });

      expect(frameEl().style.transform).toBe("translate(-50px, -40px) scale(1)");
    });

    test("放大到 150% 后拖动立绘，屏幕位移按视图比例换算（任意缩放下坐标准确）", async () => {
      renderDialog();
      await screen.findByText("400");

      await typeZoom("150");
      // 向上拖 150 个屏幕像素 = 100 个画面像素 → faceY 多 100/0.366 ≈ 273
      fireEvent.pointerDown(stageEl(), {
        button: 0,
        pointerId: 5,
        clientX: 480,
        clientY: 400,
      });
      fireEvent.pointerMove(stageEl(), {
        pointerId: 5,
        clientX: 480,
        clientY: 250,
      });
      fireEvent.pointerUp(stageEl(), {
        pointerId: 5,
        clientX: 480,
        clientY: 250,
      });

      expect(await screen.findByText("(568, 313)")).toBeTruthy();
    });
  });
});
