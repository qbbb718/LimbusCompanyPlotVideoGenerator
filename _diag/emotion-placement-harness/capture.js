/**
 * 临时排版检查：把 `index.html`（真实 CSS + 摆放面板结构）离屏渲染成截图。
 *
 *   node_modules/electron/dist/electron.exe capture.js
 *
 * 用法仅限于这次「立绘 → 情绪动画 → 摆放」改动的目视验收，收工就删。
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const logFile = path.join(DIR, "capture-log.txt");
const log = (message) => fs.appendFileSync(logFile, `${message}\n`);

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
// 应用正在运行时 %APPDATA%\limbus-company-plot-video-generator 被占用：换独立 profile
app.setPath("userData", path.join(DIR, "profile"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1000,
      height: 600,
      useContentSize: true,
      show: false,
      frame: false,
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });

    await win.loadFile(path.join(DIR, "index.html"));
    await wait(600);

    // 量一下三行控件在窄面板下的实际可用宽度：滑杆不能被挤到没法拖
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const out = [];
        document.querySelectorAll(".stage").forEach((stage, stageIndex) => {
          stage.querySelectorAll(".transform-row").forEach((row, rowIndex) => {
            const label = row.querySelector(".transform-label");
            const field = row.querySelector(".transform-number");
            const reset = row.querySelector(".transform-reset-icon-btn");
            const slider = row.querySelector(".transform-slider");
            out.push({
              stage: stageIndex + 1,
              row: rowIndex + 1,
              name: label ? label.textContent : "?",
              labelW: Math.round(label ? label.getBoundingClientRect().width : 0),
              fieldW: Math.round(field ? field.getBoundingClientRect().width : 0),
              resetW: Math.round(reset ? reset.getBoundingClientRect().width : 0),
              sliderW: Math.round(slider ? slider.getBoundingClientRect().width : 0),
              hintLines: (() => {
                const hint = row.parentElement.querySelector(".emotion-placement-hint");
                if (!hint) return 0;
                const style = getComputedStyle(hint);
                return Math.round(
                  hint.getBoundingClientRect().height / parseFloat(style.lineHeight || "16"),
                );
              })(),
              overflow: row.scrollWidth - row.clientWidth,
            });
          });
        });
        return out;
      })()
    `);

    fs.writeFileSync(path.join(DIR, "shot-placement.png"), (await win.webContents.capturePage()).toPNG());
    log(JSON.stringify(metrics, null, 2));
    win.destroy();
    app.exit(0);
  })
  .catch((error) => {
    log(`FAILED ${error && error.stack ? error.stack : error}`);
    app.exit(1);
  });
