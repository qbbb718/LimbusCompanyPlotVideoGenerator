import { pickScreenColor } from "./screenColorPicker";

/**
 * 渲染进程侧的屏幕取色封装：
 * - Electron 下走主进程的全屏取色遮罩，颜色统一规范成大写 #RRGGBB；
 * - 用户取消返回 null（不是异常，调用方不需要提示）；
 * - 遮罩报错时抛出带提示的异常；
 * - 浏览器调试模式退化成 Chromium 的 EyeDropper。
 */
describe("屏幕取色（渲染进程封装）", () => {
  afterEach(() => {
    (window as any).electronAPI = undefined;
    (window as any).EyeDropper = undefined;
  });

  const setBridge = (pickScreenColorImpl: jest.Mock) => {
    (window as any).electronAPI = { pickScreenColor: pickScreenColorImpl };
    return pickScreenColorImpl;
  };

  test("Electron 下调用主进程并规范颜色", async () => {
    const bridge = setBridge(
      jest.fn().mockResolvedValue({ ok: true, color: "#12ab34" }),
    );

    await expect(pickScreenColor()).resolves.toBe("#12AB34");
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  test("用户取消时返回 null", async () => {
    setBridge(
      jest.fn().mockResolvedValue({ ok: false, reason: "canceled" }),
    );

    await expect(pickScreenColor()).resolves.toBeNull();
  });

  test("主进程报错时抛出可直接展示的提示", async () => {
    setBridge(
      jest.fn().mockResolvedValue({
        ok: false,
        reason: "error",
        error: "屏幕截图失败",
      }),
    );

    await expect(pickScreenColor()).rejects.toThrow("屏幕截图失败");
  });

  test("没有 Electron 桥时退化成 EyeDropper", async () => {
    class FakeEyeDropper {
      open() {
        return Promise.resolve({ sRGBHex: "#00ff88" });
      }
    }
    (window as any).EyeDropper = FakeEyeDropper;

    await expect(pickScreenColor()).resolves.toBe("#00FF88");
  });

  test("EyeDropper 被取消（reject）时按取消处理", async () => {
    class CanceledEyeDropper {
      open() {
        return Promise.reject(new Error("AbortError"));
      }
    }
    (window as any).EyeDropper = CanceledEyeDropper;

    await expect(pickScreenColor()).resolves.toBeNull();
  });

  test("Electron 里没有取色桥时提示重启应用（而不是静默失败）", async () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: `${originalUserAgent} Electron/39.8.10`,
    });
    // Electron 里 EyeDropper 也存在但不可用，不能被它骗过去
    (window as any).EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#00ff00" });
      }
    };

    try {
      await expect(pickScreenColor()).rejects.toThrow("请重启应用");
    } finally {
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        value: originalUserAgent,
      });
    }
  });

  test("环境不支持时抛错", async () => {
    await expect(pickScreenColor()).rejects.toThrow("不支持屏幕取色");
  });
});
