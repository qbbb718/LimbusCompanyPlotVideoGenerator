const { contextBridge, ipcRenderer, webUtils } = require("electron");

// 暴露受保护的方法给渲染进程
// intercept renderer console and forward to main process
["log", "info", "warn", "error", "debug"].forEach((level) => {
  const orig = console[level];
  console[level] = (...args) => {
    ipcRenderer.send("renderer-log", level, ...args);
    orig.apply(console, args);
  };
});

contextBridge.exposeInMainWorld("electronAPI", {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  // 菜单事件监听
  onMenuNewProject: (callback) => ipcRenderer.on("menu-new-project", callback),
  onMenuOpenProject: (callback) =>
    ipcRenderer.on("menu-open-project", callback),
  onMenuSaveProject: (callback) =>
    ipcRenderer.on("menu-save-project", callback),
  onMenuExportVideo: (callback) =>
    ipcRenderer.on("menu-export-video", callback),
  onMenuAbout: (callback) => ipcRenderer.on("menu-about", callback),

  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // 文件操作
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openImageFile: () => ipcRenderer.invoke("dialog:openImageFile"),
  saveFile: (defaultPath, data) =>
    ipcRenderer.invoke("dialog:saveFile", defaultPath, data),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),

  // 保存工程：更新已关联的工程文件（Ctrl+S，不弹对话框）
  writeFile: (filePath, data) =>
    ipcRenderer.invoke("file:write", filePath, data),
  // 保存工程：弹出保存对话框并写入（工程首次保存 / 另存为）
  saveProjectFile: (defaultPath, data) =>
    ipcRenderer.invoke("dialog:saveProjectFile", defaultPath, data),
  // 取文件选择框所选文件的真实路径（Electron 32 起 File.path 已移除，改用 webUtils）。
  // "导入工程"用它记住文件路径，之后的 Ctrl+S 直接更新同一个文件。
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch (error) {
      return "";
    }
  },

  // 通知
  showNotification: (title, body) =>
    ipcRenderer.invoke("notification:show", title, body),

  // 打开资源文件夹（characters/backgrounds/audios）
  openResourceFolder: (resourceType) =>
    ipcRenderer.invoke("folder:open", resourceType),

  // 打开任意文件夹（视频导出成功后弹窗里的"打开输出文件夹"按钮）
  openFolder: (folderPath) => ipcRenderer.invoke("folder:openPath", folderPath),

  // 导出日志：把最新若干条日志打成 zip，由主进程弹保存窗口
  exportLogs: () => ipcRenderer.invoke("logs:export"),

  // 开发者工具
  openDevTools: () => ipcRenderer.invoke("window:openDevTools"),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),

  // 获取系统信息
  getPlatform: () => process.platform,
});
