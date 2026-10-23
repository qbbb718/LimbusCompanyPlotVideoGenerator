/**
 * 立绘动画截帧验收 - 截图与比对
 *
 * 用法（正常由 run.ps1 调起；直接跑需要先跑后端导出与 tsc）：
 *   node_modules/electron/dist/electron.exe scripts/animation-acceptance/capture.js
 *
 * 做了三件事：
 * 1. 起一个离屏 Electron 窗口，加载 `previewStage.html`；
 * 2. 对后端清单里的每一帧，调真实的 `spriteAnimator + domTransform` 摆好 DOM，`capturePage()` 截图；
 * 3. 把「成片帧」和「预览截图」各自在 ROI 里算**强度加权质心**，比对两件事：
 *    · 绝对位置（基础布局一致）—— 容差 2px；
 *    · 帧间位移（动画真的按同样的量在动，且锚点一致）—— 容差 1px。
 *
 * 为什么用质心而不是逐像素 diff：两侧重采样算法不同（Java 先预缩放再合成；浏览器直接高质量
 * 降采样），边缘天然不同；但"红块落在哪"必须一致。质心对边缘差异不敏感、精度到亚像素。
 *
 * 为什么还要比"帧间位移"：只比绝对位置时，若两边都把锚点算错成同一个样式，仍会通过；
 * 位移 + 旋转（绕脚底）同时比对，才能锁住"绕脚底转"这件事。
 */

const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");
const ACCEPT_DIR = path.join(ROOT, "demo", "target", "animation-acceptance");
const TS_DIR = path.join(ACCEPT_DIR, "ts");

/**
 * 只看红块所在的窗口。整幅图里还有角色名片（左上）与对话框（底部），
 * 它们两边本来就不一样（预览层不画名片），必须排除掉。
 */
const ROI = { x0: 200, y0: 32, x1: 500, y1: 280 };

/** 与后端帧的位置容差（px）：允许两侧取整/重采样带来的半像素级差异 */
const POSITION_TOLERANCE = 2;
/** 帧间位移的容差（px）：这是"动画量一致"的硬指标 */
const DELTA_TOLERANCE = 1;

app.commandLine.appendSwitch("force-device-scale-factor", "1");
// 软件光栅化：CI/无 GPU 会话下也能跑，而且同一台机器上结果可复现
app.disableHardwareAcceleration();

app.whenReady().then(main).catch((error) => {
  console.error("[截帧验收] 失败：", error);
  app.exit(1);
});

async function main() {
  const manifestPath = path.join(ACCEPT_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到 ${manifestPath}，先跑：mvn -f demo/pom.xml test -Dtest=AnimationFrameAcceptanceExport "-Dlbc.acceptance=true"`);
  }
  if (!fs.existsSync(path.join(TS_DIR, "preview", "domTransform.js"))) {
    throw new Error(`找不到 ${TS_DIR}，先跑 tsc（见 run.ps1）`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const win = await createWindow(manifest.output);

  await win.loadFile(path.join(__dirname, "previewStage.html"));
  await win.webContents.executeJavaScript(
    `window.__tsDir = ${JSON.stringify(TS_DIR)};` +
      `window.__assetUrl = ${JSON.stringify(pathToFileURL(path.join(ACCEPT_DIR, manifest.sprite.image)).href)};`,
  );

  const previews = new Map();
  for (const frame of manifest.frames) {
    const info = await win.webContents.executeJavaScript(
      `window.renderFrame(${JSON.stringify(manifest)}, ${frame})`,
    );
    await delay(120);
    const image = await captureStage(win, manifest.output);
    const file = path.join(ACCEPT_DIR, `preview-frame-${pad(frame)}.png`);
    fs.writeFileSync(file, image.toPNG());
    previews.set(frame, image);
    console.log(
      `[截帧验收] 预览第 ${frame} 帧：transform=${info.style ? info.style.transform : "(恒等，不加 style)"}` +
        ` origin=${info.style ? info.style.transformOrigin : "-"}`,
    );
  }
  win.destroy();

  const rows = [];
  for (const frame of manifest.frames) {
    const backend = loadPng(path.join(ACCEPT_DIR, "backend", `frame-${pad(frame)}.png`));
    const preview = loadPng(path.join(ACCEPT_DIR, `preview-frame-${pad(frame)}.png`));
    rows.push({
      frame,
      backend: measure(backend),
      preview: measure(preview),
      backendSize: backend.size,
      previewSize: preview.size,
    });
  }

  report(rows);
}

/** 离屏窗口：不弹窗、固定 1x 像素密度，尺寸就是成片分辨率 */
async function createWindow(output) {
  const win = new BrowserWindow({
    width: output.width,
    height: output.height,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: "#000000",
    webPreferences: {
      offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });
  return win;
}

/** 截图并断言尺寸真的是 1:1（否则后面的像素比对全是错的） */
async function captureStage(win, output) {
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== output.width || size.height !== output.height) {
    throw new Error(
      `截图尺寸 ${size.width}x${size.height} ≠ 成片 ${output.width}x${output.height}（deviceScaleFactor 没固定成 1？）`,
    );
  }
  return image;
}

/**
 * 解码 PNG 成 { size, data }。
 *
 * <p>`toBitmap()` 是 BGRA（Windows），所以**不认通道名**：强度一律取三个颜色字节之和，
 * 与字节顺序无关。红块 0xE0/0x40/0x40 的和是 352，背景黑是 0。
 */
function loadPng(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`找不到图片：${file}`);
  }
  const image = nativeImage.createFromPath(file);
  const size = image.getSize();
  const data = image.toBitmap();
  if (data.length !== size.width * size.height * 4) {
    throw new Error(`${file} 的位图长度 ${data.length} ≠ ${size.width * size.height * 4}`);
  }
  return { size, data };
}

/**
 * ROI 内的强度加权质心 + 红块包围盒。
 *
 * @returns {{cx:number, cy:number, mass:number, box:{x0:number,y0:number,x1:number,y1:number}}}
 */
function measure(image) {
  const { width, height } = image.size;
  const { data } = image;
  let mass = 0;
  let sx = 0;
  let sy = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (let y = ROI.y0; y < Math.min(ROI.y1, height); y++) {
    for (let x = ROI.x0; x < Math.min(ROI.x1, width); x++) {
      const offset = (y * width + x) * 4;
      // 通道顺序无关：三个颜色字节求和（alpha 不参与）
      const weight = data[offset] + data[offset + 1] + data[offset + 2];
      if (weight <= 24) {
        continue;
      }
      mass += weight;
      sx += weight * x;
      sy += weight * y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (mass <= 0) {
    throw new Error("ROI 里一点亮都没有：截图是黑的（离屏渲染没出图？）");
  }
  return { cx: sx / mass, cy: sy / mass, mass, box: { x0, y0, x1, y1 } };
}

/** 打印表格并断言 */
function report(rows) {
  const failures = [];
  console.log("");
  console.log("[截帧验收] ROI = " + `x[${ROI.x0},${ROI.x1}) y[${ROI.y0},${ROI.y1})`);
  console.log("[截帧验收] 成片 vs 预览（质心，px）");
  console.table(
    rows.map((row) => ({
      帧: row.frame,
      成片x: round(row.backend.cx),
      成片y: round(row.backend.cy),
      预览x: round(row.preview.cx),
      预览y: round(row.preview.cy),
      dx: round(row.preview.cx - row.backend.cx),
      dy: round(row.preview.cy - row.backend.cy),
      成片框: `${row.backend.box.x0},${row.backend.box.y0} → ${row.backend.box.x1},${row.backend.box.y1}`,
      预览框: `${row.preview.box.x0},${row.preview.box.y0} → ${row.preview.box.x1},${row.preview.box.y1}`,
    })),
  );

  for (const row of rows) {
    const dx = row.preview.cx - row.backend.cx;
    const dy = row.preview.cy - row.backend.cy;
    if (Math.hypot(dx, dy) > POSITION_TOLERANCE) {
      failures.push(
        `第 ${row.frame} 帧绝对位置不一致：dx=${round(dx)} dy=${round(dy)}（容差 ${POSITION_TOLERANCE}px）`,
      );
    }
    const { box } = row.preview;
    if (box.x0 <= ROI.x0 || box.x1 >= ROI.x1 - 1 || box.y0 <= ROI.y0 || box.y1 >= ROI.y1 - 1) {
      failures.push(`第 ${row.frame} 帧红块贴到 ROI 边界（${JSON.stringify(box)}），测量不可信，需要放大 ROI`);
    }
  }

  if (rows.length >= 2) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const backendDelta = { x: last.backend.cx - first.backend.cx, y: last.backend.cy - first.backend.cy };
    const previewDelta = { x: last.preview.cx - first.preview.cx, y: last.preview.cy - first.preview.cy };
    const dx = previewDelta.x - backendDelta.x;
    const dy = previewDelta.y - backendDelta.y;
    console.log(
      `[截帧验收] 帧间位移：成片 (${round(backendDelta.x)}, ${round(backendDelta.y)})` +
        ` / 预览 (${round(previewDelta.x)}, ${round(previewDelta.y)})` +
        ` → 差 (${round(dx)}, ${round(dy)})`,
    );
    if (Math.hypot(dx, dy) > DELTA_TOLERANCE) {
      failures.push(
        `帧间位移不一致：成片 (${round(backendDelta.x)}, ${round(backendDelta.y)})` +
          ` vs 预览 (${round(previewDelta.x)}, ${round(previewDelta.y)})（容差 ${DELTA_TOLERANCE}px）`,
      );
    }
    if (Math.hypot(backendDelta.x, backendDelta.y) < 5) {
      failures.push("成片自己都没动（帧间位移 < 5px）：验收素材选错了帧，这个检查没有意义");
    }
  }

  if (failures.length > 0) {
    console.error("");
    console.error("[截帧验收] 不通过：");
    for (const failure of failures) {
      console.error("  ✗ " + failure);
    }
    app.exit(1);
    return;
  }
  console.log("");
  console.log("[截帧验收] 通过：预览与成片的立绘位置、帧间位移都在容差内");
  console.log(`[截帧验收] 证据：${ACCEPT_DIR}（backend/frame-*.png + preview-frame-*.png）`);
  app.exit(0);
}

function pad(frame) {
  return String(frame).padStart(3, "0");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
