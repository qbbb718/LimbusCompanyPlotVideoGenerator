/**
 * 临时排版检查：把 `index.html`（真实 CSS + 弹窗结构）离屏渲染成截图。
 *
 *   $env:SIZE="1200x760"; electron.exe capture.js
 *
 * 用法仅限于这次「保存/取消搬到标题栏 + 换示例图」的目视验收，收工就删。
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const [width, height] = (process.env.SIZE || "1400x1000")
  .split("x")
  .map((n) => parseInt(n, 10));
const tag = process.env.SIZE || "1400x1000";
const logFile = path.join(DIR, "capture-log.txt");
const log = (message) => fs.appendFileSync(logFile, `${message}\n`);

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
// 应用正在运行时 %APPDATA%\limbus-company-plot-video-generator 被占用：
// 换一个独立的 profile 目录，避免 "Unable to move the cache: 拒绝访问"
app.setPath("userData", path.join(DIR, "profile"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app
  .whenReady()
  .then(async () => {
    log(`[${tag}] window ${width}x${height}`);
    const win = new BrowserWindow({
      width,
      height,
      useContentSize: true,
      show: false,
      frame: false,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });

    await win.loadFile(path.join(DIR, "index.html"));
    await wait(500);
    fs.writeFileSync(
      path.join(DIR, `shot-${tag}-top.png`),
      (await win.webContents.capturePage()).toPNG(),
    );
    log(`[${tag}] top captured`);

    const state = await win.webContents.executeJavaScript(`
      (() => {
        const body = document.querySelector(".portrait-modal > .modal-body");
        const header = document.querySelector(".modal-header").getBoundingClientRect();
        const headerTopBefore = header.top;
        body.scrollTop = body.scrollHeight;
        return {
          windowHeight: window.innerHeight,
          bodyClientHeight: body.clientHeight,
          bodyScrollHeight: body.scrollHeight,
          scrollTop: body.scrollTop,
          headerTopBefore,
          headerTopAfter: header.top,
          footer: !!document.querySelector(".modal-footer"),
          columns: getComputedStyle(document.querySelector(".portrait-editor")).flexDirection,
        };
      })()
    `);
    await wait(300);
    fs.writeFileSync(
      path.join(DIR, `shot-${tag}-scrolled.png`),
      (await win.webContents.capturePage()).toPNG(),
    );
    log(`[${tag}] ${JSON.stringify(state)}`);
    win.destroy();
    app.exit(0);
  })
  .catch((error) => {
    log(`[${tag}] FAILED ${error && error.stack ? error.stack : error}`);
    app.exit(1);
  });
