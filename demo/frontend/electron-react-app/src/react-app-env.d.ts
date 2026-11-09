/// <reference types="react-scripts" />

interface Window {
  electronAPI: {
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    openFile: () => Promise<any>;
    openImageFile: () => Promise<any>;
    /** 批量选择图片（立绘批量导入）：多选对话框，返回 filePaths 数组 */
    openImageFiles: () => Promise<{
      canceled: boolean;
      filePaths?: string[];
    }>;
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
    /**
     * 情绪动画（序列帧）：单选一个动画文件导入（`.lcaf`，本质是 zip）。
     *
     * <p>函数名带 `animationClip` 的是**素材文件**对话框，带回用户选的绝对路径；
     * 真正读文件 / 写文件仍然走 `readFile` 与后端接口。
     */
    openAnimationClip: () => Promise<{
      canceled: boolean;
      filePath?: string;
      filePaths?: string[];
    }>;
    /** 情绪动画：多选动画文件（批量导入，一个 .lcaf = 一套动画） */
    openAnimationClips: () => Promise<{ canceled: boolean; filePaths?: string[] }>;
    /** 只选"保存到哪里"、不写文件（导出由后端直接写盘） */
    chooseSavePath: (options?: {
      title?: string;
      buttonLabel?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<{ canceled: boolean; filePath?: string }>;
    /** 只选一个目录（批量导出的落点；不写文件） */
    chooseDirectory: (options?: {
      title?: string;
      buttonLabel?: string;
      defaultPath?: string;
    }) => Promise<{ canceled: boolean; directory?: string }>;
    /** 情绪动画：选一个文件夹，把里面的图片全部导入（只取这一层） */
    openImageFolder: () => Promise<{
      canceled: boolean;
      dir?: string;
      filePaths?: string[];
      error?: string;
    }>;
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
    /**
     * 屏幕取色：主进程打开铺满屏幕的取色遮罩（可吸取软件窗口以外的颜色），
     * 单击拾取、Esc / 右键取消。取消时返回 reason="canceled"，失败时 reason="error"。
     */
    pickScreenColor: () => Promise<ScreenColorPickResult>;
  };
}

/** 主进程 color-picker:pick 的返回 */
interface ScreenColorPickResult {
  ok: boolean;
  /** 成功时是 #RRGGBB（大写） */
  color?: string;
  /** canceled = 用户取消；error = 截图/遮罩出错 */
  reason?: "canceled" | "error";
  /** reason="error" 时的提示文字 */
  error?: string;
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

