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

// 配置electron-log: 运行期间写入带时间戳的日志文件
let logDir;
if (isDev) {
  // 开发模式：__dirname 指向 demo/frontend/electron-react-app/public，向上三级到 demo/logs/
  logDir = path.join(__dirname, "..", "..", "..", "logs");
} else {
  // 生产模式：写入用户数据目录，避免写入只读 asar
  logDir = path.join(app.getPath("userData"), "logs");
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
    log.info("日志文件路径:", logFilePath);
    log.info("后端日志文件:", latestBackendLog || "未找到");
    log.info("前端日志文件名:", logFileName);

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
let backendProcess = null;

// ---- 后端生命周期管理 ----

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

/** 首次启动时将 data/、assets/、resources/ 从安装目录复制到用户数据目录 */
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

/** 启动 Spring Boot 后端 */
function startBackend(userDataPath) {
  const javaPath = findJava();
  const jarPath = findBackendJar();
  log.info("启动后端:", javaPath, "-jar", jarPath);
  log.info("后端工作目录:", userDataPath);

  backendProcess = spawn(javaPath, ["-jar", jarPath, "--server.port=8081"], {
    cwd: userDataPath,
    stdio: "pipe",
    env: {
      ...process.env,
      JAVA_TOOL_OPTIONS:
        "-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8 -Duser.timezone=Asia/Shanghai",
    },
  });

  backendProcess.stdout.on("data", (data) => {
    log.info(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    log.warn(`[backend:err] ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    log.error("后端进程启动失败:", err.message);
    backendProcess = null;
  });

  backendProcess.on("exit", (code, signal) => {
    log.info(`后端进程退出，code=${code}, signal=${signal}`);
    backendProcess = null;
  });
}

/** 轮询后端健康检查，就绪后 resolve */
function waitForBackend(url, retries = 60, interval = 2000) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const check = () => {
      attempt++;
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            log.info(`后端就绪 (attempt ${attempt})`);
            resolve();
          } else if (attempt < retries) {
            setTimeout(check, interval);
          } else {
            reject(new Error(`后端未就绪，状态码=${res.statusCode}`));
          }
        })
        .on("error", () => {
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

/** 停止后端 */
function stopBackend() {
  if (backendProcess) {
    log.info("正在停止后端进程...");
    backendProcess.kill("SIGTERM");
    // 给进程一些时间优雅退出
    setTimeout(() => {
      if (backendProcess) {
        log.warn("强制终止后端进程");
        backendProcess.kill("SIGKILL");
      }
    }, 5000);
  }
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
    // 生产模式：准备用户数据目录、启动后端、等待就绪
    try {
      const userDataPath = app.getPath("userData");
      log.info("用户数据目录:", userDataPath);
      ensureUserDataFiles(userDataPath);
      startBackend(userDataPath);

      // 显示一个加载提示（可选：splash窗口）
      log.info("等待后端启动...");
      await waitForBackend("http://localhost:8081/api/health");
      log.info("后端启动完成，创建窗口");
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

// 应用退出前停止后端
app.on("before-quit", () => {
  stopBackend();
});

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

// 图片文件对话框
ipcMain.handle("dialog:openImageFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp"] },
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
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "bmp"] },
      { name: "JSON Files", extensions: ["json"] },
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

// 打开资源目录
ipcMain.handle("folder:open", async (event, resourceType) => {
  try {
    // 计算demo项目根目录，Electron main文件位于 demo/frontend/electron-react-app/public
    const demoRoot = path.resolve(__dirname, "..", "..", "..");

    let folderPath;
    switch (resourceType) {
      case "backgrounds":
        folderPath = path.join(demoRoot, "assets", "backgrounds");
        break;
      case "characters":
        folderPath = path.join(demoRoot, "assets", "characters");
        break;
      case "audios":
        folderPath = path.join(demoRoot, "resources", "audios");
        break;
      default:
        throw new Error("未知资源类型: " + resourceType);
    }

    // 确保目录存在
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // 使用 shell 打开文件夹，如果失败会返回错误字符串
    const result = await shell.openPath(folderPath);
    if (result && result !== "") {
      console.error("打开文件夹时出错:", result);
      return { success: false, error: result };
    }

    return { success: true, path: folderPath };
  } catch (err) {
    console.error("打开资源文件夹失败", err);
    return { success: false, error: err.message };
  }
});

// 在这个文件中，你可以续写应用剩下主进程代码
// 也可以拆分成几个文件，然后用 require 导入
