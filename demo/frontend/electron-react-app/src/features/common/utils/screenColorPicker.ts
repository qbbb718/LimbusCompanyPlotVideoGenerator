import { normalizeHexColor } from "./color";

/** Chromium 的 EyeDropper（TS 4.9 的 dom lib 里还没有这个类型） */
interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>;
}

interface EyeDropperWindow {
  EyeDropper?: new () => EyeDropperLike;
}

/**
 * @function 吸取屏幕上的一个颜色
 *
 * 优先走 Electron 主进程的全屏取色遮罩（`public/color-picker.js`）：
 * 遮罩铺满所有显示器，能吸到本软件窗口以内和以外的颜色。
 * 浏览器调试模式（`npm start` 直接开浏览器）没有这个能力，退化成 Chromium 的 EyeDropper。
 *
 * @return 取到的颜色（大写 #RRGGBB）；用户取消返回 null
 * @throws 环境不支持或取色失败时抛错，message 可以直接展示给用户
 */
export async function pickScreenColor(): Promise<string | null> {
  const bridge = window.electronAPI;

  if (bridge && typeof bridge.pickScreenColor === "function") {
    const result = await bridge.pickScreenColor();
    if (result && result.ok) {
      return normalizeHexColor(result.color);
    }
    if (result && result.reason === "error") {
      throw new Error(result.error || "屏幕取色失败，请重试");
    }
    return null;
  }

  // Electron 里没有这个桥，说明 preload / 主进程不是同一版本（改完 preload 没重启应用）。
  // Electron 的 EyeDropper 本身不可用，这里也不能静默失败，否则用户点吸管会觉得"没反应"。
  if (window.navigator.userAgent.toLowerCase().includes("electron")) {
    throw new Error("屏幕取色不可用：请重启应用后再试");
  }

  const EyeDropperCtor = (window as unknown as EyeDropperWindow).EyeDropper;
  if (typeof EyeDropperCtor === "function") {
    try {
      const result = await new EyeDropperCtor().open();
      return normalizeHexColor(result && result.sRGBHex);
    } catch (error) {
      // 用户按 Esc 取消时 EyeDropper 会 reject，这里按"取消"处理
      return null;
    }
  }

  throw new Error("当前环境不支持屏幕取色，请在桌面应用里使用");
}
