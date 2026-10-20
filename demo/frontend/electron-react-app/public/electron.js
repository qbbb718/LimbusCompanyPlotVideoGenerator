const {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  dialog,
  Notification,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const log = require("electron-log");
const {
  collectLatestFiles,
  createZipBuffer,
  formatTimestamp,
} = require("./log-export/zip-writer");
// 屏幕取色（颜色面板的"吸管"）：desktopCapturer + 全屏遮罩，见 color-picker.js
const { registerColorPicker } = require("./color-picker");
const isDev = !app.isPackaged;

// autoUpdater — 仅在打包后可用，开发模式静默跳过
let autoUpdater = null;
if (!isDev) {
  try {
    const { autoUpdater: au } = require("electron-updater");
    autoUpdater = au;
  } catch (e) {
    log.warn("electron-updater 不可用:", e.message);
  }
}

// ============================================================================
// 数据根目录（资源存储位置）——"素材、数据库、临时工程、日志到底放在哪"的唯一决策点
// ============================================================================
//
// 默认位置是 Electron 的用户数据目录（Windows 为
// %APPDATA%\limbus-company-plot-video-generator），也就是 C 盘。素材、工程、临时图片与日志
// 会越攒越大，C 盘吃紧的用户需要能把它整体搬到别的盘，因此这里支持四种来源，
// 优先级从高到低：
//
//   1. 命令行参数 --data-dir=<目录>     （临时指定，例如同时维护几套数据）
//   2. 环境变量 LBC_DATA_DIR            （后端 RuntimePaths 也认它，两边天然一致）
//   3. 定位文件 <默认用户数据目录>\data-location.json 里的 dataRoot
//      （设置页「资源存储位置」写入，普通用户走的就是这条）
//   4. 默认：app.getPath("userData")
//
// 为什么"主进程说了算"：后端（Spring Boot）的数据根目录由 RuntimePaths 从
// -Dlbc.data.dir / LBC_DATA_DIR / 默认值 解析，而"启动后端"这件事只发生在主进程里。
// 主进程先把最终值算出来，再用 -Dlbc.data.dir=<最终值> 传给后端（见 spawnOwnBackend），
// 两边不可能再指向不同目录。改位置后必须重启：运行期的 DATA_ROOT 是常量，
// 换目录等于换一个后端进程的工作目录与数据库，热切换只会让两边不一致。
//
// 定位文件为什么留在默认目录里：它必须待在一个"不随设置变化"的位置，否则把数据搬到 D 盘后
// 就再也找不到"当前数据在哪"这条记录了。它只有一百多字节，留在 C 盘不影响磁盘占用。

/** 定位文件名（固定放在默认用户数据目录，不随数据根目录移动） */
const DATA_LOCATION_FILE_NAME = "data-location.json";
/** 命令行参数前缀：--data-dir=D:\LBC-Data */
const DATA_DIR_CLI_PREFIX = "--data-dir=";
/** 数据根目录下会被"搬家"带走的子目录，与后端 RuntimePaths 推导出的目录一一对应 */
const DATA_SUBDIRS = ["assets", "data", "projects", "resources", "logs"];
/** 统计目录大小时最多扫描多少个文件（素材特别多时不能让设置页一直转圈） */
const DATA_SCAN_FILE_LIMIT = 200000;

/** 各来源在界面上的说法 */
const DATA_SOURCE_LABELS = {
  cli: "命令行参数 --data-dir",
  env: "环境变量 LBC_DATA_DIR",
  config: "设置页自定义",
  default: "默认位置",
};

/** 默认数据根目录（Electron 用户数据目录） */
function getDefaultDataRoot() {
  return app.getPath("userData");
}

/** 定位文件的完整路径 */
function getDataLocationFile() {
  return path.join(getDefaultDataRoot(), DATA_LOCATION_FILE_NAME);
}

/** 去掉引号与空白并转成绝对路径；空值返回 null */
function normalizeDataPath(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^"(.*)"$/, "$1").trim();
  if (!cleaned) return null;
  try {
    return path.resolve(cleaned);
  } catch (err) {
    return null;
  }
}

/** child 是否就是 parent 本身或位于 parent 里（Windows 下大小写不敏感） */
function isSameOrInside(parent, child) {
  if (!parent || !child) return false;
  const rel = path.relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

/** 读定位文件；没有这个文件不算错误（表示用默认位置） */
function readDataLocationConfig() {
  const file = getDataLocationFile();
  try {
    if (!fs.existsSync(file)) return { dataRoot: null, file };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      dataRoot: normalizeDataPath(parsed && parsed.dataRoot),
      previousDataRoot: normalizeDataPath(parsed && parsed.previousDataRoot),
      file,
    };
  } catch (err) {
    // 定位文件被手改坏了也不能让应用起不来：按"没有定位文件"处理，并在启动日志里说明
    return { dataRoot: null, file, error: err.message };
  }
}

/**
 * 原子写定位文件（先写 .tmp 再 rename，写一半掉电也不会留下坏文件）。
 *
 * @param dataRoot 新的数据根目录
 * @param previousDataRoot 迁移前的位置。记下来是为了在设置页提醒用户
 *        "原位置还留着一整份数据，确认新位置没问题后可以手动删掉腾空间"——
 *        换位置的目的往往就是给 C 盘腾空间，删旧目录这一步不能靠用户自己想起来。
 */
function writeDataLocationConfig(dataRoot, previousDataRoot) {
  const file = getDataLocationFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    dataRoot,
    previousDataRoot: previousDataRoot || "",
    savedAt: new Date().toISOString(),
    note: "资源存储位置定位文件：dataRoot 就是素材/数据库/临时工程/日志所在的目录。删除本文件即恢复默认位置；一般由设置页维护，不建议手改。",
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return file;
}

/** 删除定位文件，回到默认位置 */
function clearDataLocationConfig() {
  const file = getDataLocationFile();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return file;
}

/** 从命令行里取 --data-dir=<目录> */
function parseDataDirCli(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (const arg of list) {
    if (typeof arg !== "string") continue;
    if (!arg.toLowerCase().startsWith(DATA_DIR_CLI_PREFIX)) continue;
    const value = arg.slice(DATA_DIR_CLI_PREFIX.length);
    if (value && value.trim()) return value;
  }
  return null;
}

/** 解析本次运行的数据根目录（优先级见本节开头的注释） */
function resolveDataRootInfo() {
  const defaultRoot = getDefaultDataRoot();
  const base = { defaultRoot, configFile: getDataLocationFile() };

  const fromCli = normalizeDataPath(parseDataDirCli(process.argv));
  if (fromCli) {
    return { ...base, dataRoot: fromCli, source: "cli", configError: "" };
  }

  const fromEnv = normalizeDataPath(process.env.LBC_DATA_DIR);
  if (fromEnv) {
    return { ...base, dataRoot: fromEnv, source: "env", configError: "" };
  }

  const config = readDataLocationConfig();
  if (config.dataRoot) {
    return {
      ...base,
      dataRoot: config.dataRoot,
      previousDataRoot: config.previousDataRoot || null,
      source: "config",
      configError: config.error || "",
    };
  }

  return { ...base, dataRoot: defaultRoot, source: "default", configError: config.error || "" };
}

const DATA_ROOT_INFO = resolveDataRootInfo();
/** 本次运行实际使用的数据根目录。切换位置要重启，所以运行期它是常量。 */
const DATA_ROOT = DATA_ROOT_INFO.dataRoot;
/** 已写进定位文件、但还没重启生效的新位置（用于界面上的"重启后生效"） */
let pendingDataRoot = null;

/** 本次运行的数据根目录 */
function getDataRoot() {
  return DATA_ROOT;
}

// 配置electron-log: 运行期间写入带时间戳的日志文件
let logDir;
/** 数据根目录不可写时退回默认目录的说明，启动日志里会打出来 */
let logDirFallback = "";
if (isDev) {
  // 开发模式：__dirname 指向 demo/frontend/electron-react-app/public，向上三级到 demo/logs/
  logDir = path.join(__dirname, "..", "..", "..", "logs");
} else {
  // 生产模式：写入数据根目录（可被设置页改到别的盘），避免写入只读 asar。
  // 数据根目录不可写（外接盘拔了、权限被改、目录被删）时退回默认目录：
  // 日志必须还能落盘，否则用户报错时连日志都拿不到。
  const preferred = path.join(DATA_ROOT, "logs");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    logDir = preferred;
  } catch (err) {
    logDir = path.join(getDefaultDataRoot(), "logs");
    logDirFallback = `无法使用日志目录 ${preferred}（${err.message}），已退回 ${logDir}`;
  }
}

// 查找最新的后端日志文件，以匹配其时间戳
function findLatestBackendLogFile() {
  try {
    console.log("[FrontendLog] 查找后端日志文件，目录:", logDir);
    const files = fs.readdirSync(logDir);
    console.log("[FrontendLog] 目录中的文件:", files);

    // 匹配后端日志文件格式: log-YYYY-MM-DD_HH-MM-SS.log
    const backendLogFiles = files.filter((f) =>
      /^log-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.log$/.test(f),
    );
    console.log("[FrontendLog] 找到的后端日志文件:", backendLogFiles);

    if (backendLogFiles.length > 0) {
      // 按文件名排序，取最新的
      backendLogFiles.sort().reverse();
      const latestLog = backendLogFiles[0];
      console.log("[FrontendLog] 使用的后端日志文件:", latestLog);
      return latestLog;
    }
    console.log("[FrontendLog] 未找到匹配的后端日志文件");
  } catch (err) {
    console.error("[FrontendLog] 查找后端日志文件失败:", err);
  }
  return null;
}

// 生成前端日志文件名
let logFileName;
const latestBackendLog = findLatestBackendLogFile();
if (latestBackendLog) {
  // 使用后端日志的时间戳，添加"-2"后缀
  logFileName = latestBackendLog.replace(".log", "-2.log");
  console.log(
    "[FrontendLog] 使用后端日志时间戳，生成前端日志文件名:",
    logFileName,
  );
} else {
  // 如果没有找到后端日志，使用当前时间
  const runTs = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+$/, "")
    .replace("T", "_");
  logFileName = `log-${runTs}-2.log`;
  console.log(
    "[FrontendLog] 未找到后端日志，使用当前时间生成前端日志文件名:",
    logFileName,
  );
}

const logFilePath = path.join(logDir, logFileName);
console.log("[FrontendLog] 前端日志完整路径:", logFilePath);

log.initialize();
log.transports.file.resolvePathFn = () => logFilePath;
log.transports.file.level = "info";
log.transports.console.level = "debug";

// set up a simple file logger for the main+renderer processes
let logStream;
function initLogFile() {
  try {
    // 初始化electron-log
    log.info("Electron日志系统初始化开始");
    // 版本号来自 package.json 的 version（app.getVersion()），与安装包文件名、
    // 「设置 → 关于」显示的版本、后端日志里的版本同源，排障时先看这一行。
    log.info("应用版本:", app.getVersion(), "| 运行模式:", isDev ? "开发" : "安装版");
    log.info("日志文件路径:", logFilePath);
    log.info("后端日志文件:", latestBackendLog || "未找到");
    log.info("前端日志文件名:", logFileName);
    // 数据根目录是排障时最需要确认的一条：素材/数据库/日志到底在哪个盘、由谁指定
    log.info(
      "数据根目录:",
      DATA_ROOT,
      "| 来源:",
      DATA_SOURCE_LABELS[DATA_ROOT_INFO.source] || DATA_ROOT_INFO.source,
      "| 定位文件:",
      DATA_ROOT_INFO.configFile,
    );
    if (DATA_ROOT_INFO.configError) {
      log.warn("定位文件解析失败，已按默认位置处理:", DATA_ROOT_INFO.configError);
    }
    if (logDirFallback) {
      log.warn(logDirFallback);
    }

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 每次运行覆盖旧日志（或保留旧日志请改为 { flags: "a" }）
    logStream = fs.createWriteStream(logFilePath, { flags: "w" });

    // wrap console methods to also write to file
    ["log", "info", "warn", "error", "debug"].forEach((level) => {
      const orig = console[level];
      console[level] = (...args) => {
        if (logStream) {
          const msg = args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
            .join(" ");
          logStream.write(
            `${new Date().toISOString()} [main:${level}] ${msg}\n`,
          );
        }
        orig.apply(console, args);
      };
    });

    // also intercept renderer events
    ipcMain.on("renderer-log", (event, level, ...args) => {
      if (logStream) {
        const msg = args
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
          .join(" ");
        logStream.write(
          `${new Date().toISOString()} [renderer:${level}] ${msg}\n`,
        );
      }
    });
  } catch (err) {
    console.error("无法初始化前端日志文件:", err);
  }
}

// 保持对window对象的全局引用，如果不这样做，当JavaScript对象被垃圾回收时，窗口将自动关闭
let mainWindow;

// ---- 单实例守卫 ----
// 没有这个守卫时，重复启动应用会出现两个 Electron 实例，各自再拉起一个 Spring Boot 后端：
// 第二个后端因 8081 被占用而启动失败 → 第二个实例走 app.quit() 退出 →
// 退出时的 stopBackend() 按全局变量杀掉了第一个实例那个“健康”的后端，
// 结果窗口还在、后端却没了，所有请求都以“请检查后端是否正常运行”告终。
// 必须在 whenReady 之前调用，保证拿不到锁的实例完全不会去启动后端。
if (!app.requestSingleInstanceLock()) {
  console.warn("检测到应用已在运行，本实例直接退出（避免重复启动后端占用 8081）");
  app.quit();
} else {
  app.on("second-instance", () => {
    // 用户重复点击图标时，把已有窗口拉到前台，而不是再开一个实例
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---- 后端生命周期管理 ----

// 8081 是固定端口，用于探测“是否已有后端在跑”（健康检查与前端 API 用同一个地址）。
const BACKEND_PORT = 8081;
const BACKEND_HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;

// 本实例自己 spawn 出来的后端进程。只有它会被 stopBackend 结束；
// 由别的实例启动的后端绝不能被本实例杀掉（这正是原 bug 的核心）。
let ownedBackendProcess = null;
// stopBackend 已经发起终止：进程退出事件由 stopBackend 负责收尾，exit handler 不要重复处理
let backendStopRequested = false;

/** 本实例启动的后端是否仍在运行（spawn 失败时 pid 为 undefined，据此排除） */
function isOwnedBackendAlive() {
  return (
    !!ownedBackendProcess &&
    typeof ownedBackendProcess.pid === "number" &&
    ownedBackendProcess.exitCode === null &&
    !ownedBackendProcess.killed
  );
}

/** 生产模式下找到 backend.jar */
function findBackendJar() {
  const resourcesPath = process.resourcesPath;
  log.info("查找 backend.jar，resourcesPath:", resourcesPath);
  const files = fs.readdirSync(resourcesPath);
  const jarFile = files.find((f) => f.startsWith("demo-") && f.endsWith(".jar"));
  if (jarFile) {
    return path.join(resourcesPath, jarFile);
  }
  // 开发模式回退
  const devJar = path.join(__dirname, "..", "..", "..", "target");
  const targetFiles = fs.readdirSync(devJar);
  const devJarFile = targetFiles.find(
    (f) => f.startsWith("demo-") && f.endsWith(".jar"),
  );
  if (devJarFile) return path.join(devJar, devJarFile);
  throw new Error("找不到 backend.jar");
}

/**
 * 首次启动时把 data/、assets/、resources/ 从安装目录复制到数据根目录。
 *
 * <p>数据根目录可以被设置页改到别的盘（见本文件顶部「数据根目录」一节），
 * 所以这里一律用调用方传进来的 dataRoot，不再自己取 app.getPath("userData")：
 * 换到新位置后同样要从安装包补齐一份素材与初始库。
 */
function ensureUserDataFiles(userDataPath) {
  const resourcesPath = process.resourcesPath;
  const dirsToCopy = ["data", "assets", "resources"];
  dirsToCopy.forEach((dir) => {
    const src = path.join(resourcesPath, dir);
    const dest = path.join(userDataPath, dir);
    if (!fs.existsSync(src)) {
      log.info(`跳过复制 ${dir}：源目录不存在`);
      return;
    }
    if (fs.existsSync(dest)) {
      log.info(`跳过复制 ${dir}：目标已存在`);
      return;
    }
    // 递归复制
    fs.cpSync(src, dest, { recursive: true });
    log.info(`已复制 ${dir} 到用户数据目录: ${dest}`);
  });
  // 确保 logs 目录存在
  const logsDir = path.join(userDataPath, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/** 查找 Java 可执行文件 */
function findJava() {
  if (isDev) return "java"; // 开发模式使用系统 PATH 中的 java

  // 生产模式：优先使用内置 JRE
  const bundledJre = path.join(process.resourcesPath, "jre", "bin", "java.exe");
  if (fs.existsSync(bundledJre)) {
    log.info("使用内置 JRE:", bundledJre);
    return bundledJre;
  }
  // 回退到系统 Java
  log.info("内置 JRE 不存在，回退到系统 Java");
  return "java";
}

/**
 * 启动 Spring Boot 后端（或复用一个已经在跑的后端）。
 *
 * 返回 { ok, owned, external }：
 *   - ok=true, owned=true   → 本实例刚启动并且确认健康，退出时需要一并停止
 *   - ok=true, external=true → 复用了别的实例已经跑着的后端，本实例退出时不能停它
 *   - ok=false              → 8081 被非本应用进程占用，或本实例的后端启动失败/未通过健康检查
 *
 * 关键点：判定“后端就绪”不能只看端口/健康检查（旧实现正是如此，
 * 所以第二个实例会误判成“自己的后端就绪”），而是要按 PID 确认响应健康检查的
 * 就是本实例 spawn 的那个进程。
 */
function startBackend(userDataPath) {
  // 入口做总兜底：findJava/findBackendJar 在 jar 丢失、安装目录不可读等情况下会同步抛错，
  // 这里统一转成 { ok:false } 返回值，避免未捕获异常直接崩掉主进程。
  try {
    return startBackendInternal(userDataPath);
  } catch (err) {
    log.error("启动后端失败:", err.message);
    return Promise.resolve({ ok: false, owned: false, external: false, reason: err.message });
  }
}

/** startBackend 的实际实现（见上方返回约定） */
function startBackendInternal(userDataPath) {
  return new Promise((resolve) => {
    // 0) 先探测 8081：已有一个健康的后端就直接复用，绝不再抢端口
    probeExistingBackend().then((existing) => {
      if (existing.alive) {
        log.info("检测到已有后端在 8081 运行（由其他实例启动），复用它，不再启动新后端");
        resolve({ ok: true, owned: false, external: true });
        return;
      }
      if (existing.portOccupied) {
        // 端口被非本应用进程占着：直接判定启动失败，不要盲等 2 分钟
        const reason = `端口 ${BACKEND_PORT} 已被其他程序占用，且不是本应用的后端`;
        log.error(reason);
        resolve({ ok: false, owned: false, external: false, reason });
        return;
      }
      // spawnOwnBackend 内部（findBackendJar 等）可能抛错：同步抛错和 Promise 拒绝都要兜住，
      // 否则这个 Promise 永远不会 settle，界面会一直卡在“等待后端启动...”。
      try {
        spawnOwnBackend(userDataPath)
          .then(resolve)
          .catch((err) => {
            log.error("启动后端失败:", err.message);
            resolve({ ok: false, owned: false, external: false, reason: err.message });
          });
      } catch (err) {
        log.error("启动后端失败:", err.message);
        resolve({ ok: false, owned: false, external: false, reason: err.message });
      }
    });
  });
}

/** 探测 8081：是否有监听、以及是否是能响应 /api/health 的后端 */
function probeExistingBackend(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(BACKEND_HEALTH_URL, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        resolve({ alive: true, portOccupied: true });
      } else {
        // 有东西在监听但不是我们的后端
        resolve({ alive: false, portOccupied: true });
      }
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ alive: false, portOccupied: true });
    });
    req.on("error", (err) => {
      if (err && err.code === "ECONNREFUSED") {
        // 无人监听 → 端口空闲，可以启动
        resolve({ alive: false, portOccupied: false });
      } else {
        // 超时/其他错误：宁可当作“被占用”也不要再抢端口
        resolve({ alive: false, portOccupied: true });
      }
    });
  });
}

/** 真正 spawn 本实例的后端进程并等待它就绪 */
function spawnOwnBackend(userDataPath) {
  return new Promise((resolve) => {
    const javaPath = findJava();
    const jarPath = findBackendJar();
    // 随安装包发布的素材目录：后端据此把缺失的素材补齐到数据根目录（ui/effects 是硬依赖）
    const bundledAssets = path.join(process.resourcesPath, "assets");
    // 数据根目录显式传给后端：RuntimePaths 的优先级里 -Dlbc.data.dir 最高，
    // 因此后端、后端的工作目录以及主进程解析出的素材目录必定指向同一个位置。
    const dataDirArg = `-Dlbc.data.dir=${userDataPath.replace(/\\/g, "/")}`;
    log.info("启动后端:", javaPath, "-jar", jarPath);
    log.info("后端工作目录:", userDataPath);
    log.info("后端数据根目录参数:", dataDirArg);
    log.info("安装包素材目录:", bundledAssets);

    const child = spawn(
      javaPath,
      [
        `-Dapp.assets.bundled=${bundledAssets}`,
        dataDirArg,
        "-jar",
        jarPath,
        `--server.port=${BACKEND_PORT}`,
      ],
      {
        cwd: userDataPath,
        stdio: "pipe",
        env: {
          ...process.env,
          JAVA_TOOL_OPTIONS:
            "-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8 -Duser.timezone=Asia/Shanghai",
        },
      },
    );

    ownedBackendProcess = child;
    backendStopRequested = false;
    let spawnFailed = false;

    child.stdout.on("data", (data) => {
      log.info(`[backend] ${data.toString().trim()}`);
    });

    child.stderr.on("data", (data) => {
      log.warn(`[backend:err] ${data.toString().trim()}`);
    });

    child.on("error", (err) => {
      log.error("后端进程启动失败:", err.message);
      spawnFailed = true;
    });

    child.on("exit", (code, signal) => {
      log.info(`后端进程退出，code=${code}, signal=${signal}`);
      if (ownedBackendProcess === child) {
        ownedBackendProcess = null;
      }
      if (!backendStopRequested) {
        // 进程自己死了（例如端口被抢占、JVM 崩溃）：明确记录，便于排查
        log.error(
          `后端进程意外退出（code=${code}, signal=${signal}），此后所有后端请求都会失败`,
        );
      }
    });

    waitForBackend(BACKEND_HEALTH_URL, { targetPid: child.pid })
      .then((result) => {
        if (!result.ok) {
          // resolve 时 ok 一定为 true，这里只是防御性兜底
          resolve({ ok: false, owned: isOwnedBackendAlive(), external: false, reason: "后端未就绪" });
          return;
        }
        if (!result.owned) {
          // 健康检查能通但不是本实例的进程（别的实例刚好抢先启动）：不要抢占，也不要在退出时杀它
          log.warn("8081 上响应健康检查的不是本实例启动的后端，按复用处理，退出时不停止它");
          resolve({ ok: true, owned: false, external: true });
          return;
        }
        // 再次确认进程还活着：健康检查通过后它也可能立刻退出，此时不能声称“owned”
        const alive = isOwnedBackendAlive();
        resolve({ ok: true, owned: alive, external: !alive });
      })
      .catch((err) => {
        // 必须兜底：否则 waitForBackend 失败时这里会一直挂着，界面卡在“等待后端启动...”
        log.error("等待后端就绪失败:", err.message);
        resolve({
          ok: false,
          owned: isOwnedBackendAlive(),
          external: false,
          reason: spawnFailed ? "后端进程无法启动" : err.message,
        });
      });
  });
}

/**
 * 轮询后端健康检查。
 * targetPid 用于确认“健康的后端确实是本实例启动的那个进程”：
 * 健康检查返回 200 后，用 netstat/lsof 反查监听 8081 的 PID 与 targetPid 比对；
 * 不等（说明是别的实例抢先启动的后端）则返回 owned=false，由调用方按“复用”处理。
 * 返回 { ok: true, owned }；超时或本实例后端已退出时 reject。
 */
function waitForBackend(url, { retries = 60, interval = 2000, targetPid = null } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const check = () => {
      attempt++;
      // 我们自己的后端进程已经死了就没必要继续等
      if (targetPid && !isOwnedBackendAlive()) {
        reject(new Error("本实例启动的后端进程已退出（端口可能被占用）"));
        return;
      }
      const req = http.get(url, async (res) => {
        res.resume();
        if (res.statusCode !== 200) {
          if (attempt < retries) {
            setTimeout(check, interval);
          } else {
            reject(new Error(`后端未就绪，状态码=${res.statusCode}`));
          }
          return;
        }
        log.info(`后端就绪 (attempt ${attempt})`);
        if (!targetPid) {
          resolve({ ok: true, owned: false });
          return;
        }
        let owned = true;
        try {
          owned = (await getListenerPid(BACKEND_PORT)) === targetPid;
        } catch (err) {
          log.warn("无法确认 8081 监听进程的 PID:", err.message);
        }
        resolve({ ok: true, owned });
      });
      req.setTimeout(interval, () => req.destroy());
      req.on("error", () => {
        if (targetPid && !isOwnedBackendAlive()) {
          reject(new Error("本实例启动的后端进程已退出（端口可能被占用）"));
          return;
        }
        if (attempt < retries) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`后端未就绪，已重试 ${retries} 次`));
        }
      });
    };
    check();
  });
}

/** 在系统 TCP 表中反查监听指定端口的进程 PID（Windows/Unix 通用） */
function getListenerPid(port) {
  const { execFile } = require("child_process");
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "netstat" : "lsof";
    const args = isWin ? ["-ano"] : ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"];
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) {
        resolve(null);
        return;
      }
      const lines = String(stdout).split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (isWin) {
          if (!t.startsWith("TCP")) continue;
          const parts = t.split(/\s+/);
          // TCP <本地地址> <外部地址> LISTENING <PID>
          if (parts[3] !== "LISTENING") continue;
          if (!parts[1] || !parts[1].endsWith(`:${port}`)) continue;
          const pid = Number(parts[4]);
          if (Number.isFinite(pid)) {
            resolve(pid);
            return;
          }
        } else {
          // lsof: java <pid> user ... TCP *:8081 (LISTEN)
          const parts = t.split(/\s+/);
          if (parts[0] === "COMMAND") continue;
          const pid = Number(parts[1]);
          if (Number.isFinite(pid)) {
            resolve(pid);
            return;
          }
        }
      }
      resolve(null);
    });
  });
}

/** 停止后端：只结束本实例自己启动的进程 */
function stopBackend() {
  const child = ownedBackendProcess;
  if (!isOwnedBackendAlive()) {
    log.info("没有需要停止的后端进程（本实例未启动后端，或后端已退出）");
    return;
  }
  log.info(`正在停止本实例启动的后端进程... pid=${child.pid}`);
  backendStopRequested = true;
  try {
    // Windows 上 kill() 等价于 TerminateProcess，端口会立即释放
    child.kill("SIGTERM");
  } catch (err) {
    log.warn("停止后端进程失败:", err.message);
  }
  // 给进程一些时间优雅退出
  setTimeout(() => {
    if (ownedBackendProcess === child && child.exitCode === null && !child.killed) {
      log.warn("强制终止后端进程");
      try {
        child.kill("SIGKILL");
      } catch (err) {
        log.warn("强制终止后端进程失败:", err.message);
      }
    }
  }, 5000);
}

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: 1.0, // 设置默认缩放因子为1.0
    },
    webSecurity: false,
    frame: true, // 使用系统默认标题栏
    show: false, // 等待后端就绪后再显示
  });

  // 加载应用
  // 开发模式加载本地服务器，生产模式加载打包后的静态文件
  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "..", "build", "index.html").replace(/\\/g, "/")}`;

  mainWindow.loadURL(startUrl);

  // 当窗口准备好显示时显示窗口
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    // 开发环境下打开开发者工具
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 当窗口被关闭时发出
  mainWindow.on("closed", () => {
    // 取消引用window对象，如果你的应用支持多窗口的话，通常会把多个window对象存放在一个数组里面，与此同时，你应该删除相应的元素
    mainWindow = null;
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 创建菜单
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建项目",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            // 发送消息到渲染进程
            mainWindow.webContents.send("menu-new-project");
          },
        },
        {
          label: "打开项目",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            mainWindow.webContents.send("menu-open-project");
          },
        },
        {
          label: "保存项目",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow.webContents.send("menu-save-project");
          },
        },
        { type: "separator" },
        {
          label: "导出视频",
          accelerator: "CmdOrCtrl+E",
          click: () => {
            mainWindow.webContents.send("menu-export-video");
          },
        },
        { type: "separator" },
        {
          label: "退出",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "重做", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "剪切", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "复制", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "粘贴", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "全选", accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", accelerator: "CmdOrCtrl+R", role: "reload" },
        {
          label: "强制重新加载",
          accelerator: "CmdOrCtrl+Shift+R",
          role: "forceReload",
        },
        { label: "开发者工具", accelerator: "F12", role: "toggleDevTools" },
        { type: "separator" },
        { label: "实际大小", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { label: "放大", accelerator: "CmdOrCtrl+Plus", role: "zoomIn" },
        { label: "缩小", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { type: "separator" },
        { label: "全屏", accelerator: "F11", role: "togglefullscreen" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于",
          click: () => {
            mainWindow.webContents.send("menu-about");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Electron会在初始化后并准备创建浏览器窗口时，调用这个函数
// 部分API在ready事件触发后才能使用
app.whenReady().then(async () => {
  initLogFile();

  if (!isDev) {
    // 生产模式：准备数据根目录（素材/数据库/日志都在这）、启动后端、等待就绪
    try {
      // 不是 app.getPath("userData")：用户可以在设置页把资源位置改到别的盘，
      // 这里必须用解析后的数据根目录（默认值就是 userData，行为不变）
      const dataRoot = getDataRoot();
      log.info("用户数据目录:", getDefaultDataRoot());
      log.info("本次使用的数据根目录:", dataRoot);
      ensureUserDataFiles(dataRoot);

      // 显示一个加载提示（可选：splash窗口）
      log.info("等待后端启动...");
      // startBackend 内部完成启动 + 健康检查（并按 PID 确认是本实例的后端）
      const backend = await startBackend(dataRoot);
      if (!backend.ok) {
        const reason = backend.reason || "后端未就绪";
        log.error("启动后端失败:", reason);
        dialog.showErrorBox(
          "启动失败",
          `无法启动后端服务: ${reason}\n\n` +
            `请确认端口 ${BACKEND_PORT} 未被其他程序占用，且已安装 Java 21 或更高版本。`,
        );
        app.quit();
        return;
      }
      if (backend.owned) {
        log.info("后端启动完成（由本实例启动，退出时会一并停止）");
      } else {
        log.info("后端启动完成（复用已有后端，退出时不会停止它）");
      }
    } catch (err) {
      log.error("启动后端失败:", err.message);
      dialog.showErrorBox(
        "启动失败",
        `无法启动后端服务: ${err.message}\n\n请确认已安装 Java 21 或更高版本。`,
      );
      app.quit();
      return;
    }
  }

  createWindow();

  // 生产模式检查更新
  if (!isDev && autoUpdater) {
    try {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: "qbbb718",
        repo: "LimbusCompanyPlotVideoGenerator",
      });
      autoUpdater.checkForUpdatesAndNotify().catch(() => {
        // 静默失败，更新检查不应影响正常使用
      });
    } catch (e) {
      log.warn("自动更新检查失败:", e.message);
    }
  }
});

// 当全部窗口关闭时退出应用
app.on("window-all-closed", () => {
  // 在macOS上，除非用户用Cmd + Q确定地退出，否则绝大部分应用及其菜单栏会保持激活
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // 在macOS上，当单击dock图标并且没有其他窗口打开时，通常在应用程序中重新创建一个窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出前停止后端。
// 只在 will-quit 里做一次即可：旧实现在 before-quit 和 will-quit 各调一次，
// 日志里会出现两条“正在停止后端进程...”，而且重复 kill 同一个句柄并不可靠。
app.on("will-quit", () => {
  stopBackend();
  if (logStream) {
    logStream.end();
  }
});

// ---- 自动更新事件 ----
if (!isDev && autoUpdater) {
  autoUpdater.on("update-available", (info) => {
    log.info("发现新版本:", info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("更新已下载:", info.version);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });

  autoUpdater.on("error", (err) => {
    log.warn("自动更新错误:", err.message);
  });
}

// IPC: 渲染进程可请求安装更新
ipcMain.handle("update:install", () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

// 处理来自渲染进程的消息
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// 屏幕取色：剧情编辑-文本-自由文字的"文字颜色"，以及角色编辑里的"名片文字颜色/背景颜色"
// 共用同一个吸管。注册一次即可，实际取色时再按需创建全屏遮罩窗口。
registerColorPicker();

// 图片文件对话框
ipcMain.handle("dialog:openImageFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!canceled) {
    return { canceled, filePaths };
  }

  return { canceled };
});

// 图片文件对话框（多选）：立绘批量导入用
ipcMain.handle("dialog:openImageFiles", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "批量选择立绘图片",
    buttonLabel: "导入",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!canceled) {
    return { canceled, filePaths };
  }

  return { canceled };
});

// 文件对话框
ipcMain.handle("dialog:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "打开工程",
    properties: ["openFile"],
    filters: [
      { name: "工程文件 (JSON)", extensions: ["json"] },
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!canceled) {
    return { canceled, filePaths };
  } else {
    return { canceled };
  }
});

ipcMain.handle("dialog:saveFile", async (event, defaultPath, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [
      { name: "JSON Files", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!canceled) {
    fs.writeFileSync(filePath, data);
    return { canceled, filePath };
  } else {
    return { canceled };
  }
});

// 保存工程：更新工程已关联的文件（Ctrl+S / "保存工程"按钮），不弹对话框。
// 失败时把原因回传给渲染进程，由前端用文字提示展示，不抛异常。
ipcMain.handle("file:write", async (event, filePath, data) => {
  try {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("未指定工程文件路径");
    }
    fs.writeFileSync(filePath, data, "utf8");
    return { success: true, filePath };
  } catch (error) {
    console.error("保存工程失败:", error);
    return { success: false, error: String((error && error.message) || error) };
  }
});

// 保存工程：工程还没关联文件时弹出保存对话框，选定位置与名称后写入
ipcMain.handle("dialog:saveProjectFile", async (event, defaultPath, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "保存工程",
    defaultPath,
    filters: [
      { name: "工程文件 (JSON)", extensions: ["json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(filePath, data, "utf8");
    return { canceled: false, success: true, filePath };
  } catch (error) {
    console.error("保存工程文件失败:", error);
    return {
      canceled: false,
      success: false,
      error: String((error && error.message) || error),
    };
  }
});

// 通知
ipcMain.handle("notification:show", (event, title, body) => {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.show();
  }
});

// 读取文件
ipcMain.handle("file:read", async (event, filePath) => {
  try {
    let resolvedPath;
    // 在 Windows 上，path.isAbsolute("/foo") 返回 true，但 "/foo" 在本应用中
    // 是 URL 风格的相对路径（如 "/assets/thumbnails/xxx.png"），不应当作
    // 盘符根目录的绝对路径处理。只有带盘符（C:\）或 UNC 路径（\\server\）
    // 才是真正的绝对路径。
    const isTrueAbsolute =
      /^[a-zA-Z]:[\\\/]/.test(filePath) || filePath.startsWith("\\\\");
    if (isTrueAbsolute) {
      // 真正的绝对路径（如选中文件的完整路径 C:\... 或 E:\...）直接读取
      resolvedPath = filePath;
    } else {
      // 相对路径统一去掉开头的 / 或 ./ 前缀，然后按项目根 demo\ 解析。
      const relativePath = filePath.replace(/^\.?\/+/, "");
      resolvedPath = path.join(__dirname, "..", "..", "..", relativePath);
    }
    const data = fs.readFileSync(resolvedPath);
    return data;
  } catch (error) {
    console.error("读取文件失败:", error);
    throw error;
  }
});

// saveThumbnail IPC handler 已删除。
// 原实现硬编码写入 assets/thumbnails/ 旧路径，导致缩略图无法随角色目录管理。
// 现在缩略图通过后端 API（POST /api/characters/{id}/portraits/{pid}/thumbnail）上传，
// 由后端按 config 保存到 {characters}/{characterId}/thumbnails/ 下，路径集中管理。

// 目录选择对话框
ipcMain.handle("dialog:selectDirectory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "选择视频导出目录",
  });

  if (!canceled && filePaths.length > 0) {
    return { canceled, path: filePaths[0] };
  }
  return { canceled };
});

/**
 * 素材根目录（{dataRoot}/assets）。
 *
 * 素材不在项目目录里：后端（com.lbc_plot.common.util.RuntimePaths）把数据根目录固定成
 * 单一来源，所有素材都放在其下的 assets/，安装版首次启动时由 ensureUserDataFiles 从安装包
 * 复制过去。数据根目录可以被设置页改到别的盘，因此这里跟主进程的后端启动参数用同一个值
 * （getDataRoot()），不再自己拼 app.getPath("userData")——否则"打开角色文件夹"会打开旧位置。
 *
 *   默认: %APPDATA%\limbus-company-plot-video-generator\assets
 *         （Windows；其它平台 ~/.limbus-company-plot-video-generator/assets）
 *   自定义: <设置页选定的目录>\assets
 *
 * 优先级与后端 RuntimePaths 一致：--data-dir= > LBC_DATA_DIR > 定位文件 > 默认值，
 * 解析统一在 resolveDataRootInfo() 里完成。
 */
function getAssetsDir() {
  return path.join(getDataRoot(), "assets");
}

// 打开资源目录（"资源管理"页各 tab 的"打开角色/背景/音频文件夹"按钮）
ipcMain.handle("folder:open", async (event, resourceType) => {
  try {
    // {dataRoot}/assets 下的三个素材子目录，与后端 RuntimePaths 的
    // getCharactersDir / getBackgroundsDir / getAudiosDir 一一对应
    const ASSET_SUBDIRS = ["characters", "backgrounds", "audios"];
    if (!ASSET_SUBDIRS.includes(resourceType)) {
      throw new Error("未知资源类型: " + resourceType);
    }

    const folderPath = path.join(getAssetsDir(), resourceType);

    // 确保目录存在：后端还没建过该素材目录时，用户看到的是空目录而不是一句报错
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // 使用 shell 打开文件夹，如果失败会返回错误字符串
    const result = await shell.openPath(folderPath);
    if (result && result !== "") {
      console.error("打开文件夹时出错:", result);
      return { success: false, error: result };
    }

    log.info("已打开资源文件夹:", folderPath);
    return { success: true, path: folderPath };
  } catch (err) {
    console.error("打开资源文件夹失败", err);
    return { success: false, error: err.message };
  }
});

// 打开任意文件夹（视频导出成功后弹窗里的"打开输出文件夹"按钮）
// 与上面的 folder:open 不同：这里的路径由渲染进程给出（来自后端返回的视频输出路径），
// 不是白名单里的资源目录，因此需要自己校验存在性，避免 shell.openPath 静默失败。
ipcMain.handle("folder:openPath", async (event, folderPath) => {
  try {
    if (typeof folderPath !== "string" || folderPath.trim() === "") {
      return { success: false, error: "文件夹路径为空" };
    }

    let target = folderPath.trim();
    // 后端可能返回相对路径（用户手填的输出路径），按 demo 根目录解析——
    // 后端 JVM 的工作目录就是 demo/，两边解析结果才一致。
    const isTrueAbsolute =
      /^[a-zA-Z]:[\\/]/.test(target) || target.startsWith("\\\\");
    if (!isTrueAbsolute) {
      target = path.resolve(__dirname, "..", "..", "..", target);
    }

    // 传进来若是文件（例如直接给了 .mp4 路径），打开它所在的目录
    try {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        target = path.dirname(target);
      }
    } catch (statErr) {
      console.warn("检查导出路径类型失败，按目录处理:", statErr.message);
    }

    if (!fs.existsSync(target)) {
      return { success: false, error: `文件夹不存在: ${target}` };
    }

    const result = await shell.openPath(target);
    if (result && result !== "") {
      console.error("打开导出文件夹时出错:", result);
      return { success: false, error: result };
    }

    log.info("已打开输出文件夹:", target);
    return { success: true, path: target };
  } catch (err) {
    console.error("打开导出文件夹失败", err);
    return { success: false, error: err.message };
  }
});

// ============================================================================
// 资源存储位置（设置页「资源存储位置」）：查看 / 更改 / 恢复默认
// ============================================================================
//
// 目录解析规则在文件顶部「数据根目录」一节，这里只负责"给界面看"和"换位置"两件事。
// 换位置的流程刻意做成三步，任何一步失败都不会让原位置的数据消失：
//   1. 校验目标目录（不能是当前目录、不能互相包含、必须可写）；
//   2. 需要时把现有数据整份复制过去（先停后端，避免复制到写了一半的 SQLite 库）；
//   3. 写定位文件，然后提示重启。原位置的数据一律不删，用户可以自己确认后清理。

/** 往渲染进程发消息（窗口可能已经关了，失败不影响主流程） */
function sendToRenderer(channel, payload) {
  try {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch (err) {
    log.warn("向渲染进程发送消息失败:", err.message);
  }
}

/** 递归统计目录里的文件数与字节数；目录不存在时返回全 0 */
async function measureTree(root) {
  const result = { exists: false, files: 0, bytes: 0, truncated: false };
  try {
    const stat = await fs.promises.stat(root);
    if (!stat.isDirectory()) return result;
    result.exists = true;
  } catch (err) {
    return result;
  }

  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (err) {
      continue; // 没权限的子目录直接跳过：这里只是给用户看个大概数字
    }
    for (const entry of entries) {
      if (result.files >= DATA_SCAN_FILE_LIMIT) {
        result.truncated = true;
        return result;
      }
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      try {
        const stat = await fs.promises.stat(abs);
        result.files += 1;
        result.bytes += stat.size;
      } catch (err) {
        // 读不到大小就当它不存在
      }
    }
  }
  return result;
}

/** 汇总数据根目录下各子目录的占用（设置页用来显示"素材 1.2 GB / 数据库 8 MB…"） */
async function summarizeDataRoot(root) {
  const entries = [];
  let totalFiles = 0;
  let totalBytes = 0;
  for (const name of DATA_SUBDIRS) {
    const abs = path.join(root, name);
    const measure = await measureTree(abs);
    entries.push({ name, path: abs, ...measure });
    totalFiles += measure.files;
    totalBytes += measure.bytes;
  }
  return { entries, totalFiles, totalBytes };
}

/** 目标目录里是不是已经有一份工程数据（有 SQLite 库就算） */
function hasExistingLibrary(dir) {
  try {
    return fs.existsSync(path.join(dir, "data", "project.db"));
  } catch (err) {
    return false;
  }
}

/** 目标目录能不能写：建目录 + 写一个探针文件再删掉 */
function probeWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.lbc-write-test-${process.pid}.tmp`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 校验目标位置是否可用。
 *
 * @param target 目标目录（绝对路径）
 * @param options.skipNestingCheck 跳过"不能互相包含"的检查。"恢复默认位置"要跳过：
 *        默认目录是当前自定义目录的上级/下级时（用户手改过定位文件才会出现），
 *        回到默认位置仍然必须允许，否则用户就再也回不去了。
 * @returns {{ok: true, warnings: string[]} | {ok: false, error: string}}
 *          ok=false 时 error 是可以直接显示给用户的中文原因
 */
function validateDataTarget(target, { skipNestingCheck = false } = {}) {
  if (!target) return { ok: false, error: "没有选择文件夹" };

  if (path.parse(target).root === target) {
    return { ok: false, error: `不能直接把磁盘根目录当资源目录：${target}` };
  }
  // 大小写不敏感比较：Windows 路径大小写无所谓，macOS 默认也不区分
  if (target.toLowerCase() === DATA_ROOT.toLowerCase()) {
    return { ok: false, error: "新位置与当前资源位置相同" };
  }
  // 互相包含的两个目录之间复制会无限递归，也会把素材复制进素材里
  if (!skipNestingCheck && isSameOrInside(DATA_ROOT, target)) {
    return { ok: false, error: `新位置不能放在当前资源目录里面：${DATA_ROOT}` };
  }
  if (!skipNestingCheck && isSameOrInside(target, DATA_ROOT)) {
    return { ok: false, error: `新位置不能是当前资源目录的上级目录：${DATA_ROOT}` };
  }

  try {
    if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
      return { ok: false, error: `这不是文件夹：${target}` };
    }
  } catch (err) {
    return { ok: false, error: `无法访问 ${target}：${err.message}` };
  }

  const writable = probeWritable(target);
  if (!writable.ok) {
    return { ok: false, error: `这个文件夹不可写：${writable.error}` };
  }

  const warnings = [];
  if (/\s/.test(target)) {
    warnings.push(
      "路径里带空格：个别外部程序（视频编码、FFmpeg 滤镜）对带空格的路径支持不好，建议换成不含空格的目录，例如 D:\\LBC-Data。",
    );
  }
  if (isSameOrInside(getDefaultDataRoot(), target)) {
    warnings.push("新位置在默认的用户数据目录里面：卸载应用时可能被一起删掉。");
  }
  return { ok: true, warnings };
}

/** 等后端端口彻底释放（迁移前必须先确认没有进程还握着 SQLite 库） */
function waitForBackendDown(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      probeExistingBackend(800).then((probe) => {
        if (!probe.alive) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

/**
 * 迁移前停掉本实例启动的后端（它正在写数据库）。
 *
 * <p>停不掉就放弃切换：宁可让用户重开一次应用，也不能复制一份写了一半的工程库。
 */
async function stopBackendForMigration() {
  const owned = isOwnedBackendAlive();
  if (owned) {
    log.info("切换资源位置前先停止后端，避免复制到正在写入的数据库");
    stopBackend();
  }
  const down = await waitForBackendDown(owned ? 20000 : 1500);
  if (!down) {
    return {
      ok: false,
      stoppedOwned: false,
      error:
        `端口 ${BACKEND_PORT} 上还有后端在运行（可能是另一个还没关掉的应用窗口）。` +
        "请先把它们关掉再切换位置，否则会复制到写了一半的数据。",
    };
  }
  return { ok: true, stoppedOwned: owned };
}

/**
 * 把数据根目录下的各子目录复制到新位置。
 *
 * @param overwrite true=覆盖同名文件（"用当前数据覆盖目标"），false=只补目标缺少的文件
 */
async function copyDataTree(fromRoot, toRoot, { overwrite = false } = {}) {
  const copied = [];
  const skipped = [];
  const failed = [];
  const warnings = [];

  for (let i = 0; i < DATA_SUBDIRS.length; i += 1) {
    const name = DATA_SUBDIRS[i];
    const src = path.join(fromRoot, name);
    const dest = path.join(toRoot, name);
    sendToRenderer("data-location:progress", {
      entry: name,
      index: i + 1,
      total: DATA_SUBDIRS.length,
    });

    let isDirectory = false;
    try {
      isDirectory = (await fs.promises.stat(src)).isDirectory();
    } catch (err) {
      isDirectory = false;
    }
    if (!isDirectory) {
      skipped.push(name);
      continue;
    }

    try {
      await fs.promises.cp(src, dest, {
        recursive: true,
        force: overwrite,
        errorOnExist: false,
        preserveTimestamps: true,
      });
      copied.push(name);
    } catch (err) {
      // 日志是排障用的附属品，复制不过去不值得整体失败；素材/数据库/工程目录则必须完整
      if (name === "logs") {
        warnings.push(`日志没能一起复制（${err.message}），新位置会从这次重启开始记日志。`);
      } else {
        failed.push(`${name}（${err.message}）`);
      }
    }
  }

  sendToRenderer("data-location:progress", null);
  return { copied, skipped, failed, warnings };
}

/**
 * 位置变更的收尾：提示重启；用户选择"稍后"时把后端按原位置拉起来，界面不至于不能用。
 */
async function finishDataLocationChange(target, { stoppedOwned }) {
  const messageBoxOptions = {
    type: "info",
    title: "资源位置已更改",
    message: `资源存储位置已改为：\n${target}`,
    detail: "重启应用后生效。现在就重启吗？",
    buttons: ["立即重启", "稍后"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const { response } = parent
    ? await dialog.showMessageBox(parent, messageBoxOptions)
    : await dialog.showMessageBox(messageBoxOptions);

  if (response === 0) {
    // 先把后端停干净再重启：新实例启动时"探测到已有后端就复用"，
    // 旧后端要是还活着就会被当成现成的后端复用，于是新实例仍然连着旧目录的数据。
    if (isOwnedBackendAlive()) {
      stopBackend();
      const down = await waitForBackendDown(8000);
      if (!down) {
        log.warn("后端进程没有在预期时间内退出，重启后可能仍连着旧位置的数据");
      }
    }
    log.info("用户选择立即重启，重新启动应用...");
    app.relaunch();
    app.quit();
    return { restarting: true };
  }

  if (stoppedOwned) {
    // 数据一个字节都没动，按原位置把后端拉起来是安全的，只是这次运行仍然用旧位置
    log.info("用户选择稍后重启，按原位置重新启动后端:", DATA_ROOT);
    const backend = await startBackend(DATA_ROOT);
    if (!backend.ok) {
      log.error("按原位置重启后端失败:", backend.reason || "未知原因");
    }
  }
  return { restarting: false };
}

/** 位置被环境变量/命令行参数锁定时统一用的提示 */
function lockedBySourceMessage() {
  const label = DATA_SOURCE_LABELS[DATA_ROOT_INFO.source] || DATA_ROOT_INFO.source;
  return (
    `当前资源位置由${label}指定（${DATA_ROOT}），它的优先级高于设置页，` +
    "在这里改了也不会生效。改回去需要去掉那个参数/环境变量。"
  );
}

/** 设置页要显示的全部信息 */
async function describeDataLocation() {
  const summary = await summarizeDataRoot(DATA_ROOT);
  return {
    ok: true,
    dataRoot: DATA_ROOT,
    defaultDataRoot: DATA_ROOT_INFO.defaultRoot,
    configFile: DATA_ROOT_INFO.configFile,
    source: DATA_ROOT_INFO.source,
    sourceLabel: DATA_SOURCE_LABELS[DATA_ROOT_INFO.source] || DATA_ROOT_INFO.source,
    isCustom: DATA_ROOT_INFO.source === "config",
    // 环境变量 / 命令行参数的优先级高于设置页，此时界面上的按钮要禁用并说明原因
    locked: DATA_ROOT_INFO.source === "env" || DATA_ROOT_INFO.source === "cli",
    configError: DATA_ROOT_INFO.configError || "",
    logDirFallback: logDirFallback || "",
    assetsDir: path.join(DATA_ROOT, "assets"),
    logsDir: logDir,
    pendingDataRoot: pendingDataRoot || "",
    needsRestart: !!pendingDataRoot,
    // 上一次迁移之前的位置（只在"设置页自定义"时存在）：原位置还留着一整份数据，
    // 界面要提醒用户可以手动删掉它来腾空间
    previousDataRoot: DATA_ROOT_INFO.previousDataRoot || "",
    ...summary,
  };
}

// 查看当前资源存储位置（设置页打开时调用）
ipcMain.handle("data-location:get", async () => {
  try {
    return await describeDataLocation();
  } catch (err) {
    log.error("读取资源存储位置失败:", err.message);
    return { ok: false, error: err.message };
  }
});

// 选择新的资源存储位置：只选+校验，真正的切换要用户再确认一次（apply）
ipcMain.handle("data-location:choose", async () => {
  try {
    if (DATA_ROOT_INFO.source === "env" || DATA_ROOT_INFO.source === "cli") {
      return { ok: false, error: lockedBySourceMessage() };
    }
    if (pendingDataRoot) {
      return {
        ok: false,
        error: `已经切换为 ${pendingDataRoot}，重启应用后才会生效。`,
      };
    }

    const openDialogOptions = {
      title: "选择资源存储位置（素材、工程数据、日志都会放在这里）",
      buttonLabel: "选择此文件夹",
      defaultPath: DATA_ROOT,
      properties: ["openDirectory", "createDirectory"],
    };
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, openDialogOptions)
      : await dialog.showOpenDialog(openDialogOptions);
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }

    const target = normalizeDataPath(filePaths[0]);
    const validation = validateDataTarget(target);
    return {
      canceled: false,
      ok: true,
      target,
      validation,
      hasExistingLibrary: validation.ok && hasExistingLibrary(target),
    };
  } catch (err) {
    log.error("选择资源存储位置失败:", err.message);
    return { ok: false, error: err.message };
  }
});

// 应用新位置（可选先把现有数据复制过去），写定位文件后提示重启
ipcMain.handle("data-location:apply", async (event, targetPath, options = {}) => {
  const migrate = options.migrate !== false;
  const overwrite = options.overwrite === true;

  try {
    if (DATA_ROOT_INFO.source === "env" || DATA_ROOT_INFO.source === "cli") {
      return { ok: false, error: lockedBySourceMessage() };
    }
    if (pendingDataRoot) {
      return { ok: false, error: `已经切换为 ${pendingDataRoot}，重启应用后才会生效。` };
    }

    const target = normalizeDataPath(targetPath);
    const validation = validateDataTarget(target);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const targetHasLibrary = hasExistingLibrary(target);
    if (migrate && targetHasLibrary && !overwrite) {
      // 目标里已经有一份工程库：必须由用户明确选择"覆盖"或"直接使用它"，不能替用户决定
      return {
        ok: false,
        needOverwriteConfirm: true,
        error: `目标文件夹里已经有一份数据：${path.join(target, "data", "project.db")}`,
      };
    }

    let migration = null;
    let stoppedOwned = false;
    if (migrate) {
      const prepared = await stopBackendForMigration();
      if (!prepared.ok) {
        return { ok: false, error: prepared.error };
      }
      stoppedOwned = prepared.stoppedOwned;

      const copyOverwrite = overwrite || targetHasLibrary;
      log.info(`开始迁移资源数据: ${DATA_ROOT} -> ${target}（覆盖同名文件=${copyOverwrite}）`);
      migration = await copyDataTree(DATA_ROOT, target, { overwrite: copyOverwrite });
      if (migration.failed.length > 0) {
        const message = `迁移没有完成，已取消切换（原位置的数据没有任何改动）：${migration.failed.join("；")}`;
        log.error(message);
        if (stoppedOwned) {
          // 后端已经被停掉，这里按原位置拉起来，界面别变成不可用
          await startBackend(DATA_ROOT);
        }
        return { ok: false, error: message, migration };
      }
      log.info(
        `迁移完成: 已复制 ${migration.copied.length} 个目录` +
          (migration.skipped.length ? `，跳过 ${migration.skipped.join("/")}（原位置没有）` : ""),
      );
    }

    let configFile;
    try {
      configFile = writeDataLocationConfig(target, DATA_ROOT);
    } catch (err) {
      if (stoppedOwned) {
        await startBackend(DATA_ROOT);
      }
      return {
        ok: false,
        error: `无法写入定位文件 ${DATA_ROOT_INFO.configFile}：${err.message}`,
      };
    }

    pendingDataRoot = target;
    log.info(`资源存储位置已切换: ${DATA_ROOT} -> ${target}（重启后生效），定位文件: ${configFile}`);

    const finished = await finishDataLocationChange(target, { stoppedOwned });
    return {
      ok: true,
      target,
      dataRoot: DATA_ROOT,
      pendingDataRoot: target,
      needsRestart: true,
      restarting: finished.restarting,
      migration,
      configFile,
      warnings: (validation.warnings || []).concat(migration ? migration.warnings : []),
    };
  } catch (err) {
    log.error("切换资源存储位置失败:", err.message);
    return { ok: false, error: err.message };
  }
});

// 恢复默认位置（删除定位文件）。可选把当前数据复制回默认位置
ipcMain.handle("data-location:reset", async (event, options = {}) => {
  const migrate = options.migrate === true;

  try {
    if (DATA_ROOT_INFO.source !== "config") {
      return { ok: false, error: "当前不在自定义位置，无需恢复默认。" };
    }
    if (pendingDataRoot) {
      return { ok: false, error: `已经切换为 ${pendingDataRoot}，重启应用后才会生效。` };
    }

    const defaultRoot = getDefaultDataRoot();
    // 恢复默认位置一律允许（跳过"不能互相包含"检查）：否则用户手改过定位文件后可能再也回不去
    const validation = validateDataTarget(defaultRoot, { skipNestingCheck: true });
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    let migration = null;
    let stoppedOwned = false;
    if (migrate) {
      const prepared = await stopBackendForMigration();
      if (!prepared.ok) {
        return { ok: false, error: prepared.error };
      }
      stoppedOwned = prepared.stoppedOwned;

      // 默认位置往往还留着切换之前的旧库，不覆盖就等于"没搬回来"，所以这里强制覆盖
      log.info(`开始把资源数据搬回默认位置: ${DATA_ROOT} -> ${defaultRoot}`);
      migration = await copyDataTree(DATA_ROOT, defaultRoot, { overwrite: true });
      if (migration.failed.length > 0) {
        const message = `复制没有完成，已取消恢复（原位置的数据没有任何改动）：${migration.failed.join("；")}`;
        log.error(message);
        if (stoppedOwned) {
          await startBackend(DATA_ROOT);
        }
        return { ok: false, error: message, migration };
      }
    }

    try {
      clearDataLocationConfig();
    } catch (err) {
      if (stoppedOwned) {
        await startBackend(DATA_ROOT);
      }
      return { ok: false, error: `无法删除定位文件：${err.message}` };
    }

    pendingDataRoot = defaultRoot;
    log.info(`资源存储位置已恢复默认: ${DATA_ROOT} -> ${defaultRoot}（重启后生效）`);

    const finished = await finishDataLocationChange(defaultRoot, { stoppedOwned });
    return {
      ok: true,
      target: defaultRoot,
      dataRoot: DATA_ROOT,
      pendingDataRoot: defaultRoot,
      needsRestart: true,
      restarting: finished.restarting,
      migration,
      warnings: migration ? migration.warnings : [],
    };
  } catch (err) {
    log.error("恢复默认资源位置失败:", err.message);
    return { ok: false, error: err.message };
  }
});

// 用资源管理器打开当前数据根目录
ipcMain.handle("data-location:open", async () => {
  try {
    const dir = getDataRoot();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const result = await shell.openPath(dir);
    if (result) {
      return { success: false, error: result };
    }
    log.info("已打开资源目录:", dir);
    return { success: true, path: dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 立即重启（设置页"重启后生效"旁边那个按钮）
ipcMain.handle("data-location:relaunch", () => {
  log.info("用户请求重启应用...");
  app.relaunch();
  app.quit();
});

// ---- 日志导出（设置页"获取日志"）----

/** 导出时最多打包几个日志文件（安装版日志目录会一直累积，全量打包没有意义） */
const LOG_EXPORT_MAX_FILES = 10;

/**
 * 日志目录。与文件顶部 logDir 完全一致，这样"导出日志"拿到的就是本次运行正在写的那个目录：
 * 安装版 `<数据根目录>/logs`（设置页可以把数据根目录改到别的盘），开发模式 `demo/logs`。
 */
function getLogDir() {
  return logDir;
}

/**
 * 把日志目录里最新的 N 个文件打成 zip，并让用户选保存位置（点"获取日志"时调用）。
 *
 * 返回给渲染进程的结构固定为 { ok, ... }，不抛异常：
 * canceled 由用户点取消产生，属于正常流程，界面只需静默即可。
 */
ipcMain.handle("logs:export", async () => {
  const logDir = getLogDir();
  try {
    if (!fs.existsSync(logDir)) {
      return { ok: false, error: `未找到日志目录：${logDir}`, logDir };
    }

    const latest = collectLatestFiles(logDir, LOG_EXPORT_MAX_FILES);
    if (latest.length === 0) {
      return { ok: false, error: `日志目录里还没有日志文件：${logDir}`, logDir };
    }

    const now = new Date();
    const stamp = formatTimestamp(now);
    const zipName = `limbus-plot-logs-${stamp}.zip`;

    // 先建包再弹保存框：压缩失败（日志正被后端写入、被占用等）应当在弹窗之前就报错，
    // 而不是让用户选完路径才看到"导出失败"。
    const zip = await createZipBuffer(latest, { folder: `logs-${stamp}` });

    let defaultPath;
    try {
      defaultPath = path.join(app.getPath("downloads"), zipName);
    } catch (e) {
      defaultPath = zipName;
    }

    const { canceled, filePath } = await dialog.showSaveDialog(
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      {
        title: "保存日志压缩包",
        defaultPath,
        buttonLabel: "保存",
        filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
      },
    );
    if (canceled || !filePath) {
      return { ok: false, canceled: true };
    }

    // 用户在保存框里删掉 .zip 后缀时补回来，避免得到一个没法双击打开的文件
    const target = /\.zip$/i.test(filePath) ? filePath : `${filePath}.zip`;
    fs.writeFileSync(target, zip.buffer);

    log.info(
      `已导出日志压缩包: ${target}（${zip.entries.length} 个文件，${zip.zipSize} 字节）`,
    );
    return {
      ok: true,
      filePath: target,
      fileCount: zip.entries.length,
      rawSize: zip.rawSize,
      zipSize: zip.zipSize,
      logDir,
      skipped: zip.skipped,
    };
  } catch (err) {
    log.error("导出日志压缩包失败:", err.message);
    return { ok: false, error: err.message || String(err), logDir };
  }
});

// 在这个文件中，你可以续写应用剩下主进程代码
// 也可以拆分成几个文件，然后用 require 导入
