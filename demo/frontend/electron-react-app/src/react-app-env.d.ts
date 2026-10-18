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
    // ---- 资源存储位置（数据根目录）----
    // 默认 %APPDATA%\limbus-company-plot-video-generator，可整体换到别的盘；
    // 切换后必须重启应用，所以结果里统一带 needsRestart。
    getDataLocation: () => Promise<DataLocationInfo & { ok: boolean; error?: string }>;
    chooseDataLocation: () => Promise<DataLocationChoice>;
    applyDataLocation: (
      targetPath: string,
      options?: { migrate?: boolean; overwrite?: boolean },
    ) => Promise<DataLocationChangeResult>;
    resetDataLocation: (
      options?: { migrate?: boolean },
    ) => Promise<DataLocationChangeResult>;
    openDataLocation: () => Promise<{ success: boolean; path?: string; error?: string }>;
    relaunchApp: () => Promise<void>;
    onDataLocationProgress: (
      callback: (payload: DataLocationProgress | null) => void,
    ) => void;
    onMenuNewProject: (callback: () => void) => void;
    onMenuOpenProject: (callback: () => void) => void;
    onMenuSaveProject: (callback: () => void) => void;
    onMenuExportVideo: (callback: () => void) => void;
    onMenuAbout: (callback: () => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}

/**
 * 资源存储位置（数据根目录）下某个子目录的占用情况。
 *
 * `name` 与后端 RuntimePaths 的子目录一一对应：assets / data / projects / resources / logs
 */
interface DataLocationEntry {
  name: string;
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
  /** 文件数超过主进程扫描上限时为 true，此时 files/bytes 只是下限 */
  truncated: boolean;
}

/** 设置页「资源存储位置」显示的信息（主进程 data-location:get 的返回） */
interface DataLocationInfo {
  dataRoot: string;
  /** 默认位置（Electron 用户数据目录），"恢复默认位置"的目标 */
  defaultDataRoot: string;
  /** 定位文件路径（默认用户数据目录下的 data-location.json） */
  configFile: string;
  /** default | config | env | cli */
  source: string;
  sourceLabel: string;
  isCustom: boolean;
  /** 由环境变量或命令行参数指定时，设置页改不动，按钮要禁用 */
  locked: boolean;
  configError: string;
  /** 数据根目录不可写、日志退回默认目录时的说明，正常为空 */
  logDirFallback: string;
  assetsDir: string;
  logsDir: string;
  /** 已写入定位文件、还没重启生效的新位置，空串表示没有 */
  pendingDataRoot: string;
  needsRestart: boolean;
  /** 上一次迁移之前的位置；原位置仍留着一整份数据，提示用户可以手动清理，空串表示没有 */
  previousDataRoot: string;
  entries: DataLocationEntry[];
  totalFiles: number;
  totalBytes: number;
}

/** 主进程 data-location:choose 的返回：只选好位置，还没切换 */
interface DataLocationChoice {
  canceled?: boolean;
  ok?: boolean;
  error?: string;
  target?: string;
  validation?: { ok: boolean; error?: string; warnings?: string[] };
  /** 目标目录里已经有一份工程数据（data/project.db） */
  hasExistingLibrary?: boolean;
  targetSummary?: {
    entries: DataLocationEntry[];
    totalFiles: number;
    totalBytes: number;
  } | null;
}

/** 迁移进度（复制过程中推给渲染进程） */
interface DataLocationProgress {
  entry: string;
  index: number;
  total: number;
}

/** 主进程 data-location:apply / reset 的返回 */
interface DataLocationChangeResult {
  ok: boolean;
  error?: string;
  /** 目标里已有数据、需要用户确认是否覆盖时为 true */
  needOverwriteConfirm?: boolean;
  target?: string;
  /** 本次运行仍在用的位置（没重启前不变） */
  dataRoot?: string;
  pendingDataRoot?: string;
  needsRestart?: boolean;
  /** 主进程已经在重启应用 */
  restarting?: boolean;
  configFile?: string;
  warnings?: string[];
  migration?: {
    copied: string[];
    skipped: string[];
    failed: string[];
    warnings: string[];
  } | null;
}

