/// <reference types="react-scripts" />

interface Window {
  electronAPI: {
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    openFile: () => Promise<any>;
    openImageFile: () => Promise<any>;
    saveFile: (filename: string, data: string) => Promise<any>;
    readFile: (filePath: string) => Promise<Buffer>;
    /** 保存工程：更新已关联的工程文件（Ctrl+S），不弹对话框 */
    writeFile: (
      filePath: string,
      data: string,
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    /** 保存工程：弹出保存对话框并写入（首次保存 / 另存为） */
    saveProjectFile: (
      defaultPath: string,
      data: string,
    ) => Promise<{
      canceled: boolean;
      success?: boolean;
      filePath?: string;
      error?: string;
    }>;
    /** 取文件选择框所选文件的真实路径（Electron 32 起 File.path 已移除） */
    getPathForFile: (file: File) => string;
    selectDirectory: () => Promise<{ canceled: boolean; path?: string }>;
    saveThumbnail: (fileName: string, data: Uint8Array) => Promise<string>;
    getAppVersion: () => Promise<string>;
    getAppPath: () => Promise<string>;
    openResourceFolder: (resourceType: "characters" | "backgrounds" | "audios") => Promise<{ success: boolean; path?: string; error?: string }>;
    // 打开任意文件夹（视频导出成功弹窗使用，传入导出目录或视频文件路径）
    openFolder: (folderPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    // 导出日志压缩包：主进程弹保存窗口，返回保存结果（canceled=true 表示用户取消）
    exportLogs: () => Promise<{
      ok: boolean;
      canceled?: boolean;
      error?: string;
      filePath?: string;
      fileCount?: number;
      rawSize?: number;
      zipSize?: number;
      logDir?: string;
      skipped?: { name: string; reason: string }[];
    }>;
    onMenuNewProject: (callback: () => void) => void;
    onMenuOpenProject: (callback: () => void) => void;
    onMenuSaveProject: (callback: () => void) => void;
    onMenuExportVideo: (callback: () => void) => void;
    onMenuAbout: (callback: () => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}
