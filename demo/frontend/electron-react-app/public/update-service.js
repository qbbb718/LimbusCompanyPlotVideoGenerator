/**
 * 自动更新（Windows / NSIS 安装版）—— 探查更新源 → 提示 → 下载 → 静默安装。
 *
 * <p>为什么单独一个文件：`electron.js` 已经两千多行，"更新"是一条完整的状态机
 * （检查 / 有新版本 / 下载中 / 已就绪 / 安装中 / 出错），塞进主进程入口只会让两边都难读。
 * 这里只依赖 electron + electron-log + electron-updater，渲染进程通过 `update:*` 这组 IPC
 * 与 `update:status` 推送拿状态（见 public/preload.js 与设置页的 UpdateSection.tsx）。
 *
 * <h3>更新源为什么是 generic 而不是 GitHub provider</h3>
 * electron-updater 的 GitHub provider 走的是 **api.github.com**（见
 * node_modules/electron-updater/out/providers/GitHubProvider.js），随后还要去
 * objects.githubusercontent.com 取资产；这两处在国内经常一个能通、一个不能通。
 * 而 generic 只需要读一个静态文件 `<url>/latest.yml`，再按里面的相对路径下载安装包——
 * 也就是说：**把 GitHub 地址前面拼一个加速前缀，整条链路就跟着走了**，镜像站不用懂 GitHub API。
 * 所以这里统一用 generic，更新源 = GitHub 原地址 + 若干加速前缀（见 MIRROR_PREFIXES）。
 *
 * <h3>为什么自己 fetch 探测，而不是直接 checkForUpdates</h3>
 * 1. 多源依次尝试时，`checkForUpdates()` 内部有 `checkForUpdatesPromise` 去重：上一个源
 *    卡住没返回时，再调一次拿到的是同一个 pending promise，于是"换源"根本没发生。
 * 2. 需要一个可控的超时：连不上的源要 8 秒就放弃，而不是等操作系统的 TCP 超时。
 * 3. 探测只需要 latest.yml 这一个文件，比走一遍 provider 轻。
 * 选定源之后才交给 electron-updater 做真正的检查 / 下载（校验 sha512、调 NSIS 安装器都靠它）。
 *
 * <h3>几个"必须这样"的细节</h3>
 * - `autoDownload = false`：安装包 ~280MB，不偷偷下。发现新版本先让用户决定。
 * - 加速前缀那段必须**以 / 结尾**：electron-updater 用 `new URL(文件名, baseUrl)` 拼下载地址，
 *   结尾没有斜杠的话它会把最后一段（download）删掉，拼出 .../latest/latest.yml 这种错地址。
 * - 走加速前缀时关掉差量下载（`disableDifferentialDownload`）：差量要靠 Range 请求，
 *   代理站大多不支持，开了反而下载失败。
 * - 安装前必须停后端：java 进程开着安装目录里的 `demo-*.jar`，Windows 上文件被占用，
 *   安装器覆盖不了那个 jar（表现为"更新装完了但还是旧版本"）。所以装之前先 stopBackend，
 *   并等它真的退出（见 electron.js 传进来的 onBeforeInstall）。
 * - `quitAndInstall(true, true)`：默认参数是**非静默**，会弹出 NSIS 安装向导（选目录 → 下一步），
 *   那就不是"一键"了。true,true = 静默安装 + 装完自动启动。
 *
 * <h3>本地安装包（把 exe 拖进来安装）</h3>
 * 安装包只能是自己下载的（GitHub 打不开时最常见），所以入口是"选文件 / 拖进窗口"。
 * 但"拖进来就执行"等于给任意 exe 开了个口子，因此：文件名必须是 `LCP<版本>.exe`、
 * 必须比当前版本新、**必须和 latest.yml 里的 sha512 一致**才静默安装；
 * 核对不上（或离线拿不到 latest.yml）时只返回"待确认"，由界面把路径 / 大小 / 校验结果显示给用户，
 * 用户明确点确认后才继续。
 */

const { app, ipcMain, Notification, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const log = require("electron-log");
// latest.yml 的解析与版本比较：纯函数放在单独文件里，好让 Node 单测直接跑
// （scripts/update-manifest.test.mjs）。解析写错不会报错，只会"永远发现不了新版本"。
const {
  parseLatestYml,
  compareVersions,
  pickTarget,
  findManifestFile,
} = require("./update-manifest");

// ============================================================================
// 常量：更新源
// ============================================================================

const OWNER = "qbbb718";
const REPO = "LimbusCompanyPlotVideoGenerator";
const GITHUB_REPO_URL = `https://github.com/${OWNER}/${REPO}`;
/** 最新一版 release 的资产目录（结尾必须有 /，见文件头"必须这样"第 2 条） */
const LATEST_ASSETS_URL = `${GITHUB_REPO_URL}/releases/latest/download/`;
/** 给人看的发布页（检查失败时界面上"手动下载"就跳这里） */
const RELEASE_PAGE_URL = `${GITHUB_REPO_URL}/releases/latest`;

const MANIFEST_FILE = "latest.yml";
/** 各版本更新说明，由 CI 从 docs/版本更新笔记.md 生成后作为 release 资产上传 */
const CHANGELOG_FILE = "changelog.json";

/** 单个源的探测超时：8 秒连不上就换下一个，不让用户对着"检查更新中"干等 */
const PROBE_TIMEOUT_MS = 8000;
/** 启动后多久自动查一次：避开启动时后端 / 素材初始化抢带宽 */
const AUTO_CHECK_DELAY_MS = 25000;
/** 长期开着的用户也要能看到新版本 */
const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** 本地安装包的最小体积（正常安装包 ~280MB；几十 KB 的肯定不是） */
const MIN_INSTALLER_SIZE = 50 * 1024 * 1024;

/**
 * 加速前缀：只做"把 github.com 上的 release 资产原样转出来"这一件事。
 * 想换 / 加通道时只改这里（id 会出现在日志与界面上，方便判断这次走的是哪条路）。
 */
const MIRROR_PREFIXES = [
  { id: "gh-proxy", label: "加速通道 1", prefix: "https://gh-proxy.com/" },
  { id: "ghfast", label: "加速通道 2", prefix: "https://ghfast.top/" },
];

/** 全部更新源：官方地址 + 加速前缀（generic provider，只读 latest.yml） */
const SOURCES = [
  { id: "github", label: "GitHub", direct: true, baseUrl: LATEST_ASSETS_URL },
  ...MIRROR_PREFIXES.map((mirror) => ({
    id: mirror.id,
    label: mirror.label,
    direct: false,
    baseUrl: `${mirror.prefix}${LATEST_ASSETS_URL}`,
  })),
];

// ============================================================================
// electron-updater：打包后才有；开发模式靠 LBC_UPDATE_DEV=1 显式打开
// ============================================================================

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (err) {
  // 最可能的原因：electron-updater 被放进了 devDependencies，electron-builder 不会打包它，
  // 于是安装版里 require 失败、更新功能整个消失，而且没有任何界面提示。
  log.error("[更新] electron-updater 不可用:", err.message);
}

/** 开发模式也跑更新流程（配合 dev-app-update.yml，见 docs/本地打包说明.md） */
const forceDevUpdateConfig = process.env.LBC_UPDATE_DEV === "1";

// ============================================================================
// 状态机
// ============================================================================

/**
 * 推给界面的状态。渲染进程挂载时先 `update:get-state` 拉一次，之后订阅 `update:status`——
 * 只订阅不拉取会漏掉"窗口还没打开就已经检查完"的那一次。
 *
 * phase:
 *   idle        还没查过
 *   checking    正在探查更新源
 *   up-to-date  已是最新
 *   available   有新版本，等用户点"下载"
 *   downloading 下载中（带 percent / 速度）
 *   downloaded  已下载，等用户点"重启安装"
 *   installing  正在安装（应用马上会退出）
 *   error       出错（带面向用户的 error 与详情 errorDetail）
 */
let state = {
  phase: "idle",
  currentVersion: app.getVersion(),
  releasePage: RELEASE_PAGE_URL,
  /** 各更新源，界面可以在出错时说明"试过哪几条路" */
  sources: SOURCES.map((source) => ({ id: source.id, label: source.label })),
};

/** 当前窗口（由 electron.js 注入，窗口关掉后返回 null） */
let getWindow = () => null;
/** 安装前要做的清理（停后端），由 electron.js 注入 */
let beforeInstall = async () => {};
/** 上一次 check 有没有成功把 provider 指到某个源上：没指上就不允许 downloadUpdate */
let prepared = false;
/** 探测到的、与当前版本比较可用的源（downloadUpdate 用得到它的 feed） */
let preparedSource = null;

function setState(patch) {
  state = { ...state, ...patch };
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("update:status", state);
  }
  return state;
}

function setError(userMessage, detail, extra = {}) {
  log.warn(`[更新] ${userMessage}${detail ? ": " + detail : ""}`);
  prepared = false;
  return setState({
    phase: "error",
    error: userMessage,
    errorDetail: detail || "",
    checkedAt: Date.now(),
    links: buildLinks(),
    ...extra,
  });
}

// ============================================================================
// 小工具
// ============================================================================

/** 带超时的 GET（只用来读 latest.yml / changelog.json 这种小文件） */
async function fetchText(url, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 面向用户的"手动下载"链接：官方发布页 + 各加速通道的直链 */
function buildLinks(version) {
  const links = [{ label: "GitHub 发布页", url: RELEASE_PAGE_URL }];
  if (!version) return links;
  const fileName = `LCP${version}.exe`;
  for (const source of SOURCES) {
    if (source.direct) continue;
    links.push({ label: `${source.label}下载`, url: `${source.baseUrl}${fileName}` });
  }
  return links;
}

/** 只在白名单域名里打开外链：渲染进程传来的 url 不能直接交给 shell.openExternal */
function openExternalSafe(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ""));
  } catch (err) {
    return { ok: false, error: "链接格式不对" };
  }
  const allowedHosts = ["github.com", "gh-proxy.com", "ghfast.top"];
  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
    log.warn("[更新] 拒绝打开非白名单链接:", parsed.href);
    return { ok: false, error: "这个链接不在允许的范围内" };
  }
  shell.openExternal(parsed.href).catch((err) => log.warn("[更新] 打开链接失败:", err.message));
  return { ok: true };
}

// ============================================================================
// 更新源探测
// ============================================================================

/**
 * 并发探查所有源。
 *
 * 并发而不是依次：国内网络下"GitHub 直连"和"加速通道"经常一个通一个不通，
 * 依次等超时要 8+8+8 秒；并发时最慢那条 8 秒就结束了。
 *
 * @returns {Promise<{reachable: {source: object, manifest: object, elapsedMs: number}[], elapsedMs: number}>}
 */
async function probeSources() {
  const startedAt = Date.now();
  const results = await Promise.all(
    SOURCES.map(async (source) => {
      const sourceStartedAt = Date.now();
      const url = `${source.baseUrl}${MANIFEST_FILE}`;
      try {
        const text = await fetchText(url);
        const manifest = parseLatestYml(text);
        if (!manifest.version) throw new Error("latest.yml 里没有 version");
        log.info(`[更新] 源 ${source.id} 可用，最新版本 ${manifest.version}（${Date.now() - sourceStartedAt}ms）`);
        return { source, manifest, elapsedMs: Date.now() - sourceStartedAt };
      } catch (err) {
        log.warn(`[更新] 源 ${source.id} 不可用: ${err.message}（${url}）`);
        return null;
      }
    }),
  );
  return {
    reachable: results.filter(Boolean),
    elapsedMs: Date.now() - startedAt,
  };
}

/**
 * 更新说明：优先用 provider 带回来的 releaseNotes（GitHub 的 release body），
 * 没有就从同一个源读 changelog.json（加速通道也能读，CI 会把它作为 release 资产上传）。
 */
async function resolveNotes(source, updateInfo) {
  const raw = updateInfo && updateInfo.releaseNotes;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length) {
    const joined = raw
      .map((item) => (item && typeof item.note === "string" ? item.note : ""))
      .filter(Boolean)
      .join("\n");
    if (joined.trim()) return joined.trim();
  }
  try {
    const text = await fetchText(`${source.baseUrl}${CHANGELOG_FILE}`);
    const changelog = JSON.parse(text);
    const notes = changelog && changelog[updateInfo.version];
    if (typeof notes === "string" && notes.trim()) return notes.trim();
  } catch (err) {
    // changelog.json 不存在（第一次带它的版本之前）或网络断了都走这里，静默即可
    log.info("[更新] 没取到更新说明:", err.message);
  }
  return "";
}

// ============================================================================
// 状态机动作
// ============================================================================

/** 把 provider 指到选定的源上，并让 electron-updater 复核一次 */
async function prepareSource(target) {
  // 加速通道多半不支持 Range 请求，差量下载会在半路失败；整包下载虽然大，但一定成功
  autoUpdater.disableDifferentialDownload = !target.source.direct;
  autoUpdater.setFeedURL({ provider: "generic", url: target.source.baseUrl });
  const result = await autoUpdater.checkForUpdates();
  if (!result || !result.isUpdateAvailable || !result.updateInfo) {
    throw new Error("更新源返回的版本不比当前版本新");
  }
  prepared = true;
  preparedSource = target.source;
  return result.updateInfo;
}

/**
 * 检查更新。
 * @param {{manual?: boolean}} options manual=true 表示用户点的"检查更新"（出错时界面要说明原因）
 */
async function checkNow(options = {}) {
  const manual = options.manual === true;
  if (!autoUpdater) {
    return setState({
      phase: "unsupported",
      error: "更新组件不可用",
      errorDetail: "安装包里没有 electron-updater（见 docs/打包说明.md 的「自动更新」）",
      checkedAt: Date.now(),
    });
  }
  if (state.phase === "downloading" || state.phase === "installing") return state;

  prepared = false;
  preparedSource = null;
  setState({ phase: "checking", manual, error: "", errorDetail: "", links: [], checkedAt: Date.now() });

  try {
    const { reachable } = await probeSources();
    if (!reachable.length) {
      return setError("连不上更新服务器", "所有更新源都超时或被拒绝");
    }

    const target = pickTarget(reachable, state.currentVersion);
    if (!target) {
      // 所有能连上的源都说"没有比当前更新的版本"——这就是最新版
      return setState({
        phase: "up-to-date",
        version: "",
        notes: "",
        notesUrl: "",
        source: reachable[0].source.id,
        sourceLabel: reachable[0].source.label,
        links: [],
        checkedAt: Date.now(),
      });
    }

    const updateInfo = await prepareSource(target);
    const notes = await resolveNotes(target.source, updateInfo);
    return setState({
      phase: "available",
      version: updateInfo.version,
      notes,
      notesUrl: RELEASE_PAGE_URL,
      source: target.source.id,
      sourceLabel: target.source.label,
      links: buildLinks(updateInfo.version),
      checkedAt: Date.now(),
    });
  } catch (err) {
    return setError("检查更新失败", err.message);
  }
}

/** 用户点"下载更新"：交给 electron-updater（它负责 sha512 校验与差量/整包下载） */
async function downloadNow() {
  if (!autoUpdater) return { ok: false, error: "更新组件不可用" };
  if (state.phase === "downloading") return { ok: false, error: "已经在下载了" };
  if (!prepared) return { ok: false, error: "还没有找到可下载的新版本，请先检查更新" };

  setState({
    phase: "downloading",
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    error: "",
    errorDetail: "",
  });
  try {
    await autoUpdater.downloadUpdate();
    // 正常情况下 update-downloaded 已经把状态改成 downloaded；这里只是兜底
    if (state.phase === "downloading") setState({ phase: "downloaded" });
    return { ok: true };
  } catch (err) {
    return setError("下载失败", err.message, { phase: "error" });
  }
}

/** 用户点"重启并安装"：先停后端（安装器要覆盖 jar），再静默安装并自动启动新版本 */
async function installNow() {
  if (!autoUpdater) return { ok: false, error: "更新组件不可用" };
  if (state.phase !== "downloaded") return { ok: false, error: "更新包还没下载完" };

  setState({ phase: "installing" });
  try {
    await beforeInstall();
  } catch (err) {
    log.warn("[更新] 安装前的清理失败，继续安装:", err.message);
  }
  // 给渲染进程一帧时间把"正在安装"画出来，再交给安装器
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      setError("启动安装器失败", err.message);
    }
  }, 600);
  return { ok: true, installing: true, version: state.version };
}

// ============================================================================
// 本地安装包（选文件 / 拖进窗口）
// ============================================================================

/** 是否运行在解包目录（release/win-unpacked）：这种"绿色版"没有安装目录，不能静默覆盖 */
function isRunningFromUnpacked() {
  return /[\\/]win-unpacked[\\/]/i.test(String(app.getAppPath() || ""));
}

/** 流式计算文件的 sha512（base64，与 latest.yml 里的格式一致） */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("base64")));
  });
}

/**
 * 核对本地安装包：文件名 / 体积 / 与 latest.yml 里的 sha512。
 *
 * @returns {Promise<{status: "match"|"mismatch"|"unverified", sourceLabel?: string,
 *                    expectedShort?: string, actualShort?: string, size: number}>}
 */
async function verifyInstaller(filePath, size) {
  const fileName = path.basename(filePath);
  let reachable = [];
  try {
    ({ reachable } = await probeSources());
  } catch (err) {
    log.warn("[更新] 校验本地安装包时探测源失败:", err.message);
  }

  let expected = null;
  for (const item of reachable) {
    const entry = findManifestFile(item.manifest, fileName);
    if (entry && entry.sha512) {
      expected = { ...entry, sourceLabel: item.source.label };
      break;
    }
  }
  if (!expected) {
    return { status: "unverified", size, reason: "拿不到官方校验值（离线或更新源不可达）" };
  }

  const actual = await hashFile(filePath);
  const short = (value) => `${String(value).slice(0, 16)}…`;
  if (actual !== expected.sha512) {
    return {
      status: "mismatch",
      size,
      sourceLabel: expected.sourceLabel,
      expectedShort: short(expected.sha512),
      actualShort: short(actual),
    };
  }
  if (expected.size && expected.size !== size) {
    return {
      status: "mismatch",
      size,
      sourceLabel: expected.sourceLabel,
      expectedShort: short(expected.sha512),
      actualShort: short(actual),
      reason: `体积不符（官方 ${expected.size}，本地 ${size}）`,
    };
  }
  return { status: "match", size, sourceLabel: expected.sourceLabel, expectedShort: short(expected.sha512) };
}

/**
 * 启动安装器。
 *
 * <p>静默安装只在"知道自己装在哪、且路径里没有空格"时使用：NSIS 的 `/D=` 必须是
 * 最后一个参数且**不能加引号**，路径带空格时命令行会被拆开，装到错误的目录。
 * 拿不准就退回到带界面的安装器，让用户自己选目录——宁可多点两下，也不要把程序装散。
 */
function launchInstaller(filePath, version) {
  const installDir = isRunningFromUnpacked() ? "" : path.dirname(app.getPath("exe"));
  const canSilent = !!installDir && !/\s/.test(installDir);
  const args = ["--updated"];
  if (canSilent) {
    args.unshift("/S");
    args.push(`/D=${installDir}`);
  }

  log.info(
    `[更新] 启动安装包: ${filePath} | 参数: ${args.join(" ")} | 静默: ${canSilent} | 目标目录: ${installDir || "（由安装向导决定）"}`,
  );
  setState({ phase: "installing", version });

  const child = spawn(filePath, args, { detached: true, stdio: "ignore" });
  child.unref();
  // 应用必须先退出：安装器要覆盖安装目录里的 exe / asar / jar
  setTimeout(() => app.quit(), 1200);
  return { ok: true, installing: true, version, silent: canSilent, installDir };
}

/**
 * 用本地的安装包更新（设置页"选择安装包"、窗口里拖入 exe）。
 *
 * @param {string} rawPath 安装包绝对路径
 * @param {{confirmed?: boolean}} options confirmed=false 只做校验并返回待确认信息
 */
async function installFromFile(rawPath, options = {}) {
  const filePath = path.resolve(String(rawPath || ""));
  const fileName = path.basename(filePath);
  const nameMatch = /^LCP(\d+\.\d+\.\d+)\.exe$/i.exec(fileName);
  if (!nameMatch) {
    return { ok: false, error: "这不是本软件的安装包（文件名应形如 LCP0.6.0.exe）" };
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    return { ok: false, error: `读不到这个文件：${err.message}` };
  }
  if (!stats.isFile()) return { ok: false, error: "选中的不是文件" };
  if (stats.size < MIN_INSTALLER_SIZE) {
    return { ok: false, error: `安装包不完整（只有 ${Math.round(stats.size / 1024 / 1024)}MB，正常约 280MB）` };
  }

  const version = nameMatch[1];
  if (compareVersions(version, state.currentVersion) <= 0) {
    return { ok: false, error: `这个安装包是 ${version}，不比当前版本 ${state.currentVersion} 新` };
  }

  const verification = await verifyInstaller(filePath, stats.size);
  if (verification.status === "mismatch") {
    return {
      ok: false,
      error: "安装包与官方校验值不一致，已拒绝安装（可能是下载损坏，也可能不是官方文件）",
      info: { filePath, fileName, version, ...verification },
    };
  }

  if (!options.confirmed) {
    // 交给界面展示：路径 / 版本 / 体积 / 校验结果（verified 或 unverified）
    return { ok: false, needConfirm: true, info: { filePath, fileName, version, ...verification } };
  }

  log.info(`[更新] 用户确认用本地安装包更新: ${filePath}（${verification.status}）`);
  try {
    await beforeInstall();
  } catch (err) {
    log.warn("[更新] 安装前的清理失败，继续安装:", err.message);
  }
  return launchInstaller(filePath, version);
}

/** 弹文件选择框挑安装包（设置页"选择安装包"按钮） */
async function chooseInstallerFile() {
  const win = getWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: "选择新版本安装包",
    buttonLabel: "使用这个安装包",
    properties: ["openFile"],
    filters: [{ name: "安装包", extensions: ["exe"] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: result.filePaths[0] };
}

// ============================================================================
// electron-updater 事件
// ============================================================================

function configureUpdater() {
  autoUpdater.logger = log;
  // ~280MB 不偷偷下：先让用户看到"有什么新东西"，再决定要不要下
  autoUpdater.autoDownload = false;
  // 已经下载好、用户直接关掉应用时，退出即安装（BaseUpdater 这条路径本身就是静默的）
  autoUpdater.autoInstallOnAppQuit = true;
  if (forceDevUpdateConfig) autoUpdater.forceDevUpdateConfig = true;

  autoUpdater.on("download-progress", (progress) => {
    if (state.phase !== "downloading") return;
    setState({
      percent: Number(progress.percent) || 0,
      transferred: Number(progress.transferred) || 0,
      total: Number(progress.total) || 0,
      bytesPerSecond: Number(progress.bytesPerSecond) || 0,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("[更新] 下载完成:", info && info.version);
    setState({ phase: "downloaded", version: (info && info.version) || state.version, percent: 100 });
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: "新版本已下载完成",
        body: `重启应用即可用上 v${(info && info.version) || state.version}`,
      });
      notification.on("click", () => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      });
      notification.show();
    }
  });

  autoUpdater.on("error", (err) => {
    log.warn("[更新] electron-updater 报错:", err && err.message);
    // 检查阶段的错误由 checkNow 的 catch 统一处理；这里只处理"下载中/安装前"的失败
    if (state.phase === "downloading") {
      setError("下载失败", err && err.message);
    }
  });
}

// ============================================================================
// IPC / 生命周期
// ============================================================================

function registerIpc() {
  ipcMain.handle("update:get-state", () => state);
  ipcMain.handle("update:check", () => checkNow({ manual: true }));
  ipcMain.handle("update:download", () => downloadNow());
  ipcMain.handle("update:install", () => installNow());
  ipcMain.handle("update:install-from-file", (event, filePath, options) =>
    installFromFile(filePath, options || {}),
  );
  ipcMain.handle("update:choose-installer", () => chooseInstallerFile());
  ipcMain.handle("update:open-link", (event, url) => openExternalSafe(url));
}

/**
 * @param {{getWindow: () => Electron.BrowserWindow | null,
 *          onBeforeInstall?: () => Promise<void> | void}} hooks
 */
function init(hooks = {}) {
  getWindow = hooks.getWindow || getWindow;
  beforeInstall = hooks.onBeforeInstall || beforeInstall;
  state.currentVersion = app.getVersion();

  if (!autoUpdater) {
    // 更新组件没打进安装包：界面要能说明白，而不是让"检查更新"永远停在"正在读取更新状态"。
    // IPC 仍然要注册 —— 否则渲染进程 invoke 时根本没有 handler，只能拿到一个 rejected promise。
    state = { ...state, phase: "unsupported", error: "更新组件不可用", errorDetail: "" };
    registerIpc();
    return;
  }
  configureUpdater();
  registerIpc();
  log.info(
    "[更新] 更新服务已就绪 | 当前版本:",
    state.currentVersion,
    "| 源:",
    SOURCES.map((source) => source.id).join(" / "),
    "| 开发模式强制更新配置:",
    forceDevUpdateConfig,
  );
}

/** 启动自动检查：打包版才真检查；开发模式要显式 LBC_UPDATE_DEV=1 */
function startAutoCheck() {
  if (!autoUpdater) return;
  if (!app.isPackaged && !forceDevUpdateConfig) {
    log.info("[更新] 开发模式（未打包），跳过自动检查；要测更新请设 LBC_UPDATE_DEV=1");
    return;
  }
  const firstTimer = setTimeout(() => {
    void checkNow({ manual: false });
  }, AUTO_CHECK_DELAY_MS);
  if (typeof firstTimer.unref === "function") firstTimer.unref();

  const intervalTimer = setInterval(() => {
    // 只在"没有待处理结果"时自动重查，别把用户正在看的"发现新版本"覆盖掉
    if (["idle", "up-to-date", "error"].includes(state.phase)) {
      void checkNow({ manual: false });
    }
  }, AUTO_CHECK_INTERVAL_MS);
  if (typeof intervalTimer.unref === "function") intervalTimer.unref();
}

module.exports = {
  init,
  startAutoCheck,
  checkNow,
  downloadNow,
  installNow,
  installFromFile,
  getState: () => state,
  // 排障用：最新的探测结果（不含 electron-updater 内部状态）
  _internal: { parseLatestYml, compareVersions, pickTarget, findManifestFile },
};
