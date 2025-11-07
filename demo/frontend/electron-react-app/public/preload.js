
const { contextBridge, ipcRenderer } = require('electron');

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 菜单事件监听
  onMenuNewProject: (callback) => ipcRenderer.on('menu-new-project', callback),
  onMenuOpenProject: (callback) => ipcRenderer.on('menu-open-project', callback),
  onMenuSaveProject: (callback) => ipcRenderer.on('menu-save-project', callback),
  onMenuExportVideo: (callback) => ipcRenderer.on('menu-export-video', callback),
  onMenuAbout: (callback) => ipcRenderer.on('menu-about', callback),

  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // 文件操作
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openImageFile: () => ipcRenderer.invoke('dialog:openImageFile'),
  saveFile: (defaultPath, data) => ipcRenderer.invoke('dialog:saveFile', defaultPath, data),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // 通知
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', title, body),

  // 开发者工具
  openDevTools: () => ipcRenderer.invoke('window:openDevTools'),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // 获取系统信息
  getPlatform: () => process.platform
});
