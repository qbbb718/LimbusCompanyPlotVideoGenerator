/**
 * @module 屏幕取色器（主进程）
 *
 * 给渲染进程里的"颜色面板"提供吸取屏幕颜色的能力：打开一层铺满所有显示器的遮罩，
 * 遮罩里铺的是打开瞬间的屏幕截图；鼠标移动时显示放大镜与色值，单击拾取、Esc / 右键取消。
 *
 * 为什么不用浏览器原生的 EyeDropper：Electron 里该 API 不可用
 * （https://github.com/electron/electron/issues/44916），只能自己用
 * desktopCapturer + 全屏窗口实现。自己实现还有个好处：能吸到本软件窗口以外的颜色。
 *
 * 颜色为什么会准：
 * - 截图用 PNG 而不是 JPEG（JPEG 有损，像素值会被改掉）；
 * - 每个显示器单独按"物理分辨率"截图，避免多个显示器分辨率不同时被缩放插值；
 * - 遮罩窗口按显示器的 DIP 尺寸铺满，截图按 DIP 铺在页面里，
 *   两者只差一个缩放比，渲染进程按比例把鼠标坐标换算回截图像素，
 *   取到的就是屏幕上那个像素的原始 RGB。
 */

const { BrowserWindow, desktopCapturer, ipcMain, screen } = require("electron");
const path = require("path");
const log = require("electron-log");

/** 取色遮罩页面（与 electron.js 同目录；打包时随 electron-builder.yml 的 files 一起进 asar） */
const OVERLAY_FILE = path.join(__dirname, "color-picker-overlay.html");

/** 渲染进程请求取色（ipcMain.handle） */
const PICK_CHANNEL = "color-picker:pick";
/** 主 → 遮罩：把屏幕截图送过去 */
const OVERLAY_SOURCE_CHANNEL = "color-picker:source";
/** 遮罩 → 主：点中了某个颜色 */
const OVERLAY_RESULT_CHANNEL = "color-picker:result";
/** 遮罩 → 主：用户取消（或遮罩自己出错） */
const OVERLAY_CANCEL_CHANNEL = "color-picker:cancel";

/** 遮罩一直不点也不取消时自动收起，避免整块屏幕被一直盖住 */
const PICK_TIMEOUT_MS = 5 * 60 * 1000;

/** 主进程只接受 #RRGGBB（渲染进程那边还会再规范一次） */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** 当前取色会话；同一时间只允许一个，重复触发会先把上一个取消掉 */
let activeSession = null;

/** IPC 只注册一次 */
let registered = false;

/**
 * @function 注册屏幕取色的 IPC
 * 由 electron.js 在启动时调用一次。
 */
function registerColorPicker() {
  if (registered) return;
  registered = true;

  ipcMain.handle(PICK_CHANNEL, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    try {
      return await pickScreenColor(parentWindow);
    } catch (error) {
      log.error("[color-picker] 屏幕取色失败:", error);
      return { ok: false, reason: "error", error: describeError(error) };
    }
  });

  // 遮罩里点中了颜色：只接受本次会话自己创建的遮罩窗口发来的消息
  ipcMain.on(OVERLAY_RESULT_CHANNEL, (event, payload) => {
    const session = activeSession;
    if (!session || !isOverlaySender(session, event.sender)) return;

    const color = payload && typeof payload.color === "string" ? payload.color.trim() : "";
    if (!HEX_COLOR_PATTERN.test(color)) {
      log.warn("[color-picker] 收到格式不正确的颜色:", payload);
      settleSession(session, {
        ok: false,
        reason: "error",
        error: "取色结果格式不正确，请重试",
      });
      return;
    }
    settleSession(session, { ok: true, color: color.toUpperCase() });
  });

  ipcMain.on(OVERLAY_CANCEL_CHANNEL, (event, payload) => {
    const session = activeSession;
    if (!session || !isOverlaySender(session, event.sender)) return;

    const message =
      payload && typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "";
    settleSession(
      session,
      message
        ? { ok: false, reason: "error", error: message }
        : { ok: false, reason: "canceled" },
    );
  });
}

/**
 * @function 打开取色遮罩并等待结果
 * @param {BrowserWindow|null} parentWindow 发起取色的窗口（取完色后把焦点还给它）
 * @return {Promise<{ok: boolean, color?: string, reason?: string, error?: string}>}
 *   ok=true 时 color 是大写 #RRGGBB；取消时 reason="canceled"；失败时 reason="error"。
 */
function pickScreenColor(parentWindow) {
  return new Promise((resolve) => {
    // 已经有一个会话在跑：先取消它，不然后开的遮罩会被先开的挡住
    if (activeSession) {
      settleSession(activeSession, { ok: false, reason: "canceled" });
    }

    const displays = screen.getAllDisplays();
    if (!displays || displays.length === 0) {
      resolve({ ok: false, reason: "error", error: "没有检测到可用的显示器" });
      return;
    }

    // 光标所在的显示器优先：它的遮罩第一个创建、第一个拿到焦点，
    // 用户按 Esc 时取消的就是"眼前这一块屏幕"。
    const cursor = screen.getCursorScreenPoint();
    const orderedDisplays = orderDisplaysByCursor(displays, cursor);

    const session = {
      overlays: [],
      parentWindow: parentWindow && !parentWindow.isDestroyed() ? parentWindow : null,
      resolve,
      timer: null,
      settled: false,
      onParentClosed: null,
    };

    // 父窗口被关掉（退出应用）时，遮罩不能留在桌面上
    if (session.parentWindow) {
      session.onParentClosed = () => {
        settleSession(session, { ok: false, reason: "canceled" });
      };
      session.parentWindow.once("closed", session.onParentClosed);
    }

    (async () => {
      try {
        // 先把所有显示器的截图都抓好、遮罩都建好，最后再统一显示：
        // 一边抓一边显示的话，自己已经显示出来的遮罩可能被后面那次截图拍进去。
        for (const display of orderedDisplays) {
          if (session.settled) return;

          let image = null;
          try {
            image = await captureDisplay(display);
          } catch (error) {
            log.warn(`[color-picker] 截取显示器 ${display.id} 失败:`, error);
          }
          if (session.settled) return;
          if (!image) {
            log.warn(`[color-picker] 显示器 ${display.id} 没有拿到截图，跳过`);
            continue;
          }

          const win = createOverlayWindow(display);
          const overlay = {
            display,
            win,
            // toDataURL 是 PNG：JPEG 有损，会把要吸的像素颜色改掉
            screenshot: image.toDataURL(),
          };
          win.on("closed", () => {
            if (!session.settled) {
              settleSession(session, { ok: false, reason: "canceled" });
            }
          });
          session.overlays.push(overlay);
        }

        if (session.overlays.length === 0) {
          settleSession(session, {
            ok: false,
            reason: "error",
            error: "屏幕截图失败，请检查系统的屏幕录制权限后重试",
          });
          return;
        }
        if (session.settled) return;

        activeSession = session;
        session.timer = setTimeout(() => {
          log.info("[color-picker] 取色超时，自动关闭遮罩");
          settleSession(session, { ok: false, reason: "canceled" });
        }, PICK_TIMEOUT_MS);
        if (session.timer.unref) session.timer.unref();

        // 遮罩页面本身加载失败（极少见）时不要把黑屏窗口亮出来，按失败处理
        const loaded = await Promise.all(
          session.overlays.map(async (overlay) => {
            try {
              await loadOverlay(overlay, cursor);
              return true;
            } catch (error) {
              log.warn("[color-picker] 取色遮罩加载失败:", error);
              return false;
            }
          }),
        );
        if (session.settled) return;
        if (!loaded.some(Boolean)) {
          settleSession(session, {
            ok: false,
            reason: "error",
            error: "取色遮罩加载失败，请重试",
          });
          return;
        }

        session.overlays.forEach((overlay, index) => {
          if (loaded[index] && !overlay.win.isDestroyed()) {
            overlay.win.show();
          }
        });
        // 光标所在显示器的遮罩排在第一个：让它拿焦点，Esc 才会落到这一层
        const firstLoadedIndex = loaded.findIndex(Boolean);
        const focused = session.overlays[firstLoadedIndex];
        if (focused && !focused.win.isDestroyed()) {
          focused.win.focus();
        }

        log.info(
          `[color-picker] 取色遮罩已打开：${session.overlays.length} 个显示器，` +
            `光标在显示器 ${focused ? focused.display.id : "?"}`,
        );
      } catch (error) {
        log.error("[color-picker] 打开取色遮罩失败:", error);
        settleSession(session, {
          ok: false,
          reason: "error",
          error: describeError(error),
        });
      }
    })();
  });
}

/**
 * @function 结束取色会话
 * 收掉所有遮罩、把焦点还给主窗口、把结果 resolve 给渲染进程。
 * 重复调用是安全的（只有第一次生效）。
 */
function settleSession(session, result) {
  if (!session || session.settled) return;
  session.settled = true;

  if (activeSession === session) {
    activeSession = null;
  }
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  if (session.parentWindow && session.onParentClosed) {
    if (!session.parentWindow.isDestroyed()) {
      session.parentWindow.removeListener("closed", session.onParentClosed);
    }
    session.onParentClosed = null;
  }

  for (const overlay of session.overlays) {
    if (!overlay.win.isDestroyed()) {
      overlay.win.destroy();
    }
  }

  // 遮罩关掉后焦点要还给主窗口，否则用户接着敲键盘没有任何反应
  if (session.parentWindow && !session.parentWindow.isDestroyed()) {
    session.parentWindow.focus();
  }

  session.resolve(result);
}

/**
 * @function 抓取指定显示器的一张截图
 * @return {Promise<import("electron").NativeImage|null>} 拿不到时返回 null
 *
 * 注意：一次 getSources 会对所有显示器统一按 thumbnailSize 缩放。
 * 分辨率不同的显示器如果共用同一个 thumbnailSize，低分辨率那块会被放大插值，
 * 吸到的颜色就不是屏幕原色了，所以这里按显示器逐个抓、逐个指定物理尺寸。
 */
async function captureDisplay(display) {
  const scaleFactor = display.scaleFactor > 0 ? display.scaleFactor : 1;
  const width = Math.max(1, Math.round(display.size.width * scaleFactor));
  const height = Math.max(1, Math.round(display.size.height * scaleFactor));

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  if (!sources || sources.length === 0) return null;

  // display.id 是数字、source.display_id 是字符串，统一转成字符串再比
  const matched = sources.find(
    (source) => String(source.display_id) === String(display.id),
  );
  // 只有一个显示器时 display_id 偶尔为空，直接用它兜底
  const source = matched || (sources.length === 1 ? sources[0] : null);
  if (!source || source.thumbnail.isEmpty()) return null;
  return source.thumbnail;
}

/**
 * @function 创建一块铺满显示器的取色遮罩窗口
 * 无边框、置顶到屏幕保护级别，盖住任务栏；页面里铺的是截图，不透明。
 */
function createOverlayWindow(display) {
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      // 遮罩页面是本地的、自己写的页面，用 require("electron") 收发 IPC；
      // 页面里不加载任何外部内容，所以这里不必走 preload + contextBridge。
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      devTools: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // 注意：Windows 上 new BrowserWindow 会把窗口尺寸压进"工作区"（去掉任务栏），
  // 例如 1080 高的屏幕只能建出 1032 高的窗口。遮罩盖不住任务栏倒还其次，
  // 更麻烦的是截图会被纵向拉伸，光标下的像素和屏幕上看到的位置就对不上了。
  // 创建后再 setBounds 一次不会被裁剪，才能铺满整块显示器。
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });

  return win;
}

/**
 * @function 加载遮罩页面，并把截图交给它
 * @param {{win: BrowserWindow, display: Electron.Display, screenshot: string}} overlay
 * @param {{x: number, y: number}} cursor 打开遮罩时的光标位置（屏幕坐标），
 *   用来让放大镜一开始就停在光标处，用户不用先晃一下鼠标。
 */
async function loadOverlay(overlay, cursor) {
  const { win, display, screenshot } = overlay;
  await win.loadFile(OVERLAY_FILE);
  if (win.isDestroyed()) return;

  win.webContents.send(OVERLAY_SOURCE_CHANNEL, {
    image: screenshot,
    // 换成遮罩页面内的坐标（DIP）
    cursorX: cursor.x - display.bounds.x,
    cursorY: cursor.y - display.bounds.y,
  });
}

/**
 * @function 显示器排序：光标所在的那块排最前
 * 用"点到显示器矩形的距离"排序，多屏之间有空隙或坐标为负时也能算对。
 */
function orderDisplaysByCursor(displays, point) {
  return displays.slice().sort((a, b) => {
    const distanceA = distanceToDisplay(a, point);
    const distanceB = distanceToDisplay(b, point);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** 光标到显示器矩形的平方距离（在显示器内为 0） */
function distanceToDisplay(display, point) {
  const bounds = display.bounds;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
  return dx * dx + dy * dy;
}

/** 收到的 IPC 是不是本次会话的遮罩窗口发来的（防止别的页面伪造取色结果） */
function isOverlaySender(session, sender) {
  return session.overlays.some(
    (overlay) =>
      !overlay.win.isDestroyed() && overlay.win.webContents.id === sender.id,
  );
}

/** 把内部异常翻译成用户看得懂的提示 */
function describeError(error) {
  const message = error && error.message ? error.message : String(error || "");
  if (/permission|denied|not authorized|access/i.test(message)) {
    return "没有屏幕录制权限，请在系统设置里允许本应用录屏后重试";
  }
  return message || "屏幕取色失败，请重试";
}

module.exports = {
  registerColorPicker,
  pickScreenColor,
};
