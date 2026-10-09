/**
 * @module 工程文件读写
 * 负责"保存工程 / 导入工程"用到的纯逻辑：
 * 1. 记录数组的序列化与解析（工程文件格式与后端 RecordsIO 导出的格式一致：顶层就是记录数组）；
 * 2. 导入文件的归一化，兼容旧版"导出项目"（后端 RecordsIO 写出）的文件；
 * 3. 借助 Electron 主进程读写磁盘文件（浏览器环境退化为下载）。
 *
 * 这里不持有任何 React 状态，方便单独测试；状态与流程见 useProjectWorkspace.ts。
 */
import { AudioCommand, AudioType, DialogueAlign, Emotion, Record } from "@types";
import { generateUUID } from "./utils";

/** 工程文件扩展名（保存对话框过滤器与默认文件名使用） */
export const PROJECT_FILE_EXTENSION = ".json";

/** 保存工程的结果（取消时 canceled 为 true） */
export interface SaveProjectFileResult {
  canceled: boolean;
  success?: boolean;
  filePath?: string;
  error?: string;
}

/** 后端枚举（大写）→ 前端枚举（小写）的音频类型映射 */
const AUDIO_TYPE_ALIASES: { [key: string]: AudioType } = {
  BGM: AudioType.BGM,
  BGM_ACTIVE: AudioType.BGM,
  VOICE: AudioType.VOICE,
  VOICE_PLAY: AudioType.VOICE,
  SFX: AudioType.SFX,
  SFX_PLAY: AudioType.SFX,
};

/** 前端 Emotion 枚举的全部取值，用于判断导入的情绪值是否需要回退 */
const EMOTION_VALUES: string[] = Object.values(Emotion);

/**
 * @function 判断当前是否运行在 Electron 环境中
 * 浏览器（npm start 直接打开）里没有 preload 注入的 electronAPI，文件读写要走降级方案。
 */
export const isElectronRuntime = (): boolean =>
  typeof window !== "undefined" &&
  window.navigator.userAgent.toLowerCase().indexOf("electron") > -1;

/**
 * @function 取路径中的文件名
 * @param filePath 绝对路径或文件名
 * @return 文件名；入参为空时返回空字符串
 */
export const fileNameOf = (filePath?: string | null): string => {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

/**
 * @function 由项目名生成默认的工程文件名
 * @param projectName 设置页里的项目名
 * @return 形如 "新项目.json" 的文件名
 */
export const defaultProjectFileName = (projectName?: string): string => {
  const base = (projectName || "").trim() || "新工程";
  return base.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)
    ? base
    : `${base}${PROJECT_FILE_EXTENSION}`;
};

/**
 * @function 序列化工程记录
 * 保持与后端 RecordsIO 一致的缩进格式，方便用文本工具查看/比对工程文件。
 * @param records 当前工程的全部记录
 * @return 可直接写入文件的 JSON 文本
 */
export const serializeProject = (records: Record[]): string =>
  JSON.stringify(records, null, 2);

/** 数值兜底：非数字（含 NaN）时取默认值 */
const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && isFinite(value) ? value : fallback;

/**
 * @function 把文件里的情绪值归一化为前端枚举
 * 后端写文件时用大写（ANGRY），前端用大写枚举值时需要转成小写（angry），
 * 无法识别的值回退到 NORMAL，避免渲染时拿到非法情绪。
 */
const normalizeEmotion = (value: unknown): Emotion => {
  if (typeof value !== "string") return Emotion.NORMAL;
  const lower = value.toLowerCase();
  return EMOTION_VALUES.indexOf(lower) >= 0 ? (lower as Emotion) : Emotion.NORMAL;
};

/**
 * @function 把文件里的音频指令归一化为前端结构
 * 后端 RecordsIO 写出的字段是 audioId，前端用 path；fadeDuration 是后端字段，
 * 归一化时原样保留（前端不展示，但保存回文件时不至于丢掉）。
 * @param raw 文件里的单条音频指令
 * @return 前端可直接使用的音频指令
 */
const normalizeAudioCommand = (raw: any): AudioCommand => {
  const source = raw && typeof raw === "object" ? raw : {};
  const typeKey = String(source.type ?? "").toUpperCase();
  const normalized: AudioCommand = {
    type: AUDIO_TYPE_ALIASES[typeKey] || (source.type as AudioType) || AudioType.BGM,
    path: typeof source.path === "string" ? source.path : source.audioId || "",
    volume: asNumber(source.volume, 1),
    startTime: asNumber(source.startTime, 0),
    duration: asNumber(source.duration, 5),
  };

  if (typeof source.fadeDuration === "number") {
    (normalized as any).fadeDuration = source.fadeDuration;
  }
  return normalized;
};

/**
 * @function 归一化单条记录
 * 只补齐前端渲染必需的结构（dialogue / 各类视觉元素数组 / 音频指令），
 * 其余字段原样透传，保证"导入 → 保存"不会丢字段。
 * @param raw 文件里的单条记录
 * @return 前端可直接使用的记录
 */
export const normalizeRecord = (raw: any): Record => {
  const source = raw && typeof raw === "object" ? raw : {};
  const dialogue = source.dialogue && typeof source.dialogue === "object" ? source.dialogue : {};

  return {
    ...source,
    uuid: typeof source.uuid === "string" && source.uuid ? source.uuid : generateUUID(),
    durationFrames: asNumber(source.durationFrames, 30),
    dialogue: {
      ...dialogue,
      text: typeof dialogue.text === "string" ? dialogue.text : "",
      location: typeof dialogue.location === "string" && dialogue.location ? dialogue.location : "default",
      speakerC: Array.isArray(dialogue.speakerC) ? dialogue.speakerC : [],
      speakerName: typeof dialogue.speakerName === "string" ? dialogue.speakerName : "",
      faction: typeof dialogue.faction === "string" ? dialogue.faction : "",
      align: dialogue.align === DialogueAlign.CENTER ? DialogueAlign.CENTER : DialogueAlign.LEFT,
      speed: asNumber(dialogue.speed, 1),
      emotion: normalizeEmotion(dialogue.emotion),
    },
    bg: Array.isArray(source.bg) ? source.bg : [],
    chars: Array.isArray(source.chars) ? source.chars : [],
    tempImages: Array.isArray(source.tempImages) ? source.tempImages : [],
    effects: Array.isArray(source.effects) ? source.effects : [],
    audioCommands: Array.isArray(source.audioCommands)
      ? source.audioCommands.map(normalizeAudioCommand)
      : [],
  };
};

/**
 * @function 归一化记录数组
 * @param raw 文件/后端返回的原始数据
 * @return 补齐结构后的记录数组
 */
export const normalizeRecords = (raw: unknown): Record[] =>
  Array.isArray(raw) ? raw.map(normalizeRecord) : [];

/**
 * @function 解析工程文件文本
 * 兼容两种写法：顶层直接是记录数组（后端 RecordsIO 格式），或包了一层 { records: [...] }。
 * @param text 工程文件内容
 * @return 归一化后的记录数组
 * @throws 内容不是合法 JSON 或不含记录数组时抛出错误（调用方负责提示用户）
 */
export const parseProjectText = (text: string): Record[] => {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("文件内容不是合法的 JSON");
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.records)
      ? data.records
      : null;

  if (!list) {
    throw new Error("文件里没有找到记录数组");
  }
  return normalizeRecords(list);
};

/**
 * @function 解码主进程读回的文本文件内容
 * 主进程 fs.readFileSync 返回的 Buffer 经 IPC 传到渲染进程后是 Uint8Array。
 * @param buffer 文件字节
 * @return UTF-8 解码后的文本
 */
export const decodeFileBuffer = (buffer: any): string => {
  if (typeof buffer === "string") return buffer;
  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : new Uint8Array(buffer?.data ?? []);
  return new TextDecoder("utf-8").decode(bytes);
};

/**
 * @function 浏览器环境下把工程下载为文件
 * 没有 Electron 文件对话框时的降级方案（Ctrl+S 会另存为一个新下载文件）。
 * @param text 工程 JSON 文本
 * @param fileName 下载文件名
 */
export const downloadProjectFile = (text: string, fileName: string): void => {
  const url = window.URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * @function 读取磁盘上的文本文件（仅 Electron）
 * @param filePath 绝对路径
 * @return 文件文本
 * @throws 非 Electron 环境或读取失败时抛出错误
 */
export const readTextFile = async (filePath: string): Promise<string> => {
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;
  if (!api || !api.readFile) {
    throw new Error("当前环境不支持直接读取文件（改动过主进程代码时请重启应用）");
  }
  const buffer = await api.readFile(filePath);
  return decodeFileBuffer(buffer);
};

/**
 * @function 弹出"打开工程"对话框并返回所选路径（仅 Electron）
 * @return canceled 为 true 表示用户取消；否则 filePaths[0] 为所选文件绝对路径
 */
export const pickProjectFilePath = async (): Promise<{
  canceled: boolean;
  filePath?: string;
}> => {
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;
  if (!api || !api.openFile) {
    throw new Error("当前环境不支持文件对话框（改动过主进程代码时请重启应用）");
  }
  const result = await api.openFile();
  if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, filePath: result.filePaths[0] };
};

/**
 * @function 把工程内容写入已有关联的文件（Ctrl+S 更新文件，不再弹对话框）
 * @param filePath 目标文件绝对路径
 * @param text 工程 JSON 文本
 * @return 写入结果
 */
export const writeProjectFile = async (
  filePath: string,
  text: string,
): Promise<SaveProjectFileResult> => {
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;
  if (!api || !api.writeFile) {
    throw new Error("当前环境不支持写入文件（改动过主进程代码时请重启应用）");
  }
  const result = await api.writeFile(filePath, text);
  return {
    canceled: false,
    success: !!(result && result.success),
    filePath: (result && result.filePath) || filePath,
    error: result && result.error,
  };
};

/**
 * @function 弹出"保存工程"对话框并写入文件（工程尚未关联文件时的首次保存）
 * @param defaultFileName 默认文件名
 * @param text 工程 JSON 文本
 * @return 保存结果；canceled 为 true 表示用户取消
 */
export const saveProjectFileAs = async (
  defaultFileName: string,
  text: string,
): Promise<SaveProjectFileResult> => {
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;
  if (!api || !api.saveProjectFile) {
    throw new Error("当前环境不支持保存对话框（改动过主进程代码时请重启应用）");
  }
  const result = await api.saveProjectFile(defaultFileName, text);
  if (!result || result.canceled) {
    return { canceled: true };
  }
  return {
    canceled: false,
    success: !!result.success,
    filePath: result.filePath,
    error: result.error,
  };
};

/**
 * @function 从拖入/选中的 File 对象上取绝对路径
 * Electron 32 起 File.path 被移除，改用 preload 暴露的 webUtils.getPathForFile；
 * 浏览器环境没有该能力，返回 null（此时保存会走"另存为"）。
 * @param file 文件选择框得到的文件
 * @return 绝对路径；拿不到时返回 null
 */
export const pathOfFile = (file: File | null | undefined): string | null => {
  if (!file) return null;
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;
  if (!api || !api.getPathForFile) return null;
  try {
    return api.getPathForFile(file) || null;
  } catch (error) {
    return null;
  }
};
