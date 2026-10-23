/**
 * @module 工程文件读写
 * 负责"保存工程 / 导入工程"用到的纯逻辑：
 * 1. 记录数组的序列化与解析（工程文件格式与后端 RecordsIO 导出的格式一致：顶层就是记录数组）；
 *    剧情列表的分组（图层文件夹）名称与折叠状态以 group 快照附在带分组的记录上
 *    （见 recordGroups.stampGroups），所以文件仍然是一个纯记录数组；
 * 2. 导入文件的归一化，兼容旧版"导出项目"（后端 RecordsIO 写出）的文件；
 * 3. 借助 Electron 主进程读写磁盘文件（浏览器环境退化为下载）。
 *
 * 这里不持有任何 React 状态，方便单独测试；状态与流程见 useProjectWorkspace.ts。
 */
import {
  AudioCommand,
  AudioType,
  DEFAULT_FREE_TEXT_FONT_SIZE,
  DialogueAlign,
  Emotion,
  Record,
  RecordCamera,
} from "@types";
import { generateUUID } from "./utils";
import {
  keepKnownGroups,
  readGroups,
  RecordGroup,
  stampGroups,
} from "./recordGroups";
import {
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  DESIGN_HEIGHT as DESIGN_CANVAS_HEIGHT,
  DESIGN_WIDTH as DESIGN_CANVAS_WIDTH,
} from "./preview/previewLayout";
import {
  CAMERA_EASINGS,
  DEFAULT_CAMERA_EASING,
} from "./preview/cameraView";
import { normalizeStayFrames } from "@features/common/utils/projectSettings";

/** 工程文件扩展名（保存对话框过滤器与默认文件名使用） */
export const PROJECT_FILE_EXTENSION = ".json";

/**
 * 工程文件格式版本。
 *
 * <p>`{version: 1, settings, records}` 这一层是 S2c-2 才加的：旧的工程文件顶层就是记录数组。
 * 解析端两种都认（{@link parseProjectText}），写端只在**给了 settings** 时才写新形状，
 * 这样 `serializeProject(records, groups)` 的既有调用方（含后端 RecordsIO 的导入格式）不受影响。
 */
export const PROJECT_FILE_VERSION = 1;

/**
 * 工程文件里与**内容无关、只与该工程有关**的设置。
 *
 * <p>目前只有"结尾停留帧数"：它影响本工程每条记录的时长，必须跟着工程走，
 * 不能跟着机器走（否则换台机器打开同一个工程，成片节奏就变了）。
 */
export interface ProjectFileSettings {
  /** 结尾停留帧数（0~300，缺省 75） */
  stayFrames?: number;
}


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
 * 工程文件顶层仍然是记录数组：分组信息作为 group 快照附在每条带分组的记录上
 * （见 recordGroups.stampGroups），因此后端导入、老版本打开都不受影响。
 *
 * <p>给了 `settings` 时改写成 `{version, settings, records}`（S2c-2）：
 * 结尾停留帧数是**工程级**的，必须随工程文件往返，否则换台机器打开同一个工程节奏就变了。
 * 不给 `settings` 时仍然是裸数组 —— 保证"只有记录"的老调用方（与后端 RecordsIO 的
 * 导入格式）逐字节不变。
 *
 * @param records 当前工程的全部记录
 * @param groups 分组定义（名称与折叠状态）
 * @param settings 工程级设置（缺省不写 settings 段落，输出裸数组）
 * @return 可直接写入文件的 JSON 文本
 */
export const serializeProject = (
  records: Record[],
  groups: RecordGroup[] = [],
  settings?: ProjectFileSettings,
): string => {
  const stamped = stampGroups(records, groups);
  if (!settings) {
    return JSON.stringify(stamped, null, 2);
  }
  return JSON.stringify(
    {
      version: PROJECT_FILE_VERSION,
      settings: { stayFrames: normalizeStayFrames(settings.stayFrames) },
      records: stamped,
    },
    null,
    2,
  );
};

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
 * @function 归一化十六进制颜色
 * 只接受 #RGB / #RRGGBB / #AARRGGBB；非法值回退为空字符串（渲染时用默认文字颜色）。
 * 后端 ProjectConfig.parseColor 也支持不带 # 的写法，但前端统一带 # 便于颜色选择器显示。
 */
const normalizeHexColor = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)
    ? trimmed
    : "";
};

/**
 * @function 归一化自由文本字号
 * 记录里存的是设计画布像素；<=0 / 非数字时回退默认字号（与旁白一致）。
 */
const normalizeFreeTextFontSize = (value: unknown): number => {
  const size = asNumber(value, DEFAULT_FREE_TEXT_FONT_SIZE);
  return size > 0 ? Math.round(size) : DEFAULT_FREE_TEXT_FONT_SIZE;
};

/**
 * @function 归一化摄像机
 *
 * 缺省 / 非法值一律当"没有摄像机"（恒等变换）——旧工程、旧版本写的文件都没有这个字段，
 * 保持 undefined 就意味着照常渲染，不会因为多读一个字段改变构图。
 * zoom 收敛到 [0.5, 4]，与后端 Camera.getZoomFactor() 及前端 clampCamera 一致。
 *
 * <p>C2 的起止镜头：`to` 缺省 = 静止；有 `to` 但和起点一样也当静止（不写动画字段）。
 *
 * @param raw 文件里的 camera 字段
 * @return 摄像机；恒等（960,540,1）且没有动画时返回 undefined，避免无意义地往工程里写一个空镜头
 */
const normalizeCamera = (raw: any): RecordCamera | undefined => {
  if (!raw || typeof raw !== "object") return undefined;

  const readKey = (frame: any) => {
    const centerX = asNumber(frame?.centerX, DESIGN_CANVAS_WIDTH / 2);
    const centerY = asNumber(frame?.centerY, DESIGN_CANVAS_HEIGHT / 2);
    // zoom <= 0 当作 1（0 会让取景框尺寸发散），其余收敛到 [0.5, 4]；与后端 Camera 一致
    const rawZoom = asNumber(frame?.zoom, 1);
    const zoom =
      rawZoom > 0
        ? Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, rawZoom))
        : 1;
    return { centerX, centerY, zoom };
  };

  const start = readKey(raw);
  const end = raw.to ? readKey(raw.to) : undefined;
  const easing = CAMERA_EASINGS.includes(raw.easing)
    ? (raw.easing as RecordCamera["easing"])
    : undefined;

  const animated =
    end !== undefined &&
    (Math.abs(start.centerX - end.centerX) > 0.5 ||
      Math.abs(start.centerY - end.centerY) > 0.5 ||
      Math.abs(start.zoom - end.zoom) > 1e-4);

  const isIdentity =
    Math.abs(start.zoom - 1) < 1e-4 &&
    Math.abs(start.centerX - DESIGN_CANVAS_WIDTH / 2) < 0.5 &&
    Math.abs(start.centerY - DESIGN_CANVAS_HEIGHT / 2) < 0.5;
  // 静止 + 恒等 = 没有镜头；有动画的镜头哪怕起点恒等也要留着
  if (!animated && isIdentity) return undefined;

  return animated
    ? { ...start, to: end, easing: easing ?? DEFAULT_CAMERA_EASING }
    : start;
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
  const stamp = source.group && typeof source.group === "object" ? source.group : null;
  // 分组：旧工程只有 groupId，当前工程两种都写；运行时统一只认 groupId
  const groupId =
    typeof source.groupId === "string" && source.groupId
      ? source.groupId
      : stamp && typeof stamp.id === "string" && stamp.id
        ? stamp.id
        : undefined;

  return {
    ...source,
    // group 只是文件里的快照，运行时由 workspace 的 groups 保存，避免两处数据打架
    group: undefined,
    groupId,
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
      // 自由文本（说话人类型）：旧工程没有这些字段时按"非自由文本 + 隐藏UI默认勾选"处理
      freeText: dialogue.freeText === true,
      bold: dialogue.bold === true,
      italic: dialogue.italic === true,
      hideUI: dialogue.hideUI !== false,
      freeTextColor: normalizeHexColor(dialogue.freeTextColor),
      freeTextFontSize: normalizeFreeTextFontSize(dialogue.freeTextFontSize),
      freeTextX: asNumber(dialogue.freeTextX, 0),
      freeTextY: asNumber(dialogue.freeTextY, 0),
    },
    bg: Array.isArray(source.bg) ? source.bg : [],
    chars: Array.isArray(source.chars) ? source.chars : [],
    tempImages: Array.isArray(source.tempImages) ? source.tempImages : [],
    effects: Array.isArray(source.effects) ? source.effects : [],
    // 摄像机：旧工程没有这个字段 → undefined = 恒等，渲染与旧版一致
    camera: normalizeCamera(source.camera),
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

/** 工程文件解析结果：记录 + 从记录快照里还原出来的分组 + 工程级设置 */
export interface ParsedProject {
  records: Record[];
  groups: RecordGroup[];
  /** 工程级设置；旧工程（顶层是裸数组）没有这一段 → undefined，调用方保留当前设置 */
  settings?: ProjectFileSettings;
}

/**
 * @function 解析工程文件文本
 * 兼容三种写法：
 * 1. 顶层直接是记录数组（旧工程 / 后端 RecordsIO 格式）；
 * 2. 包了一层 `{ records: [...] }`；
 * 3. `{ version, settings, records }`（S2c-2 起由 {@link serializeProject} 写出）。
 * 分组定义从记录上的 group 快照还原；找不到分组定义的 groupId 会被丢掉（记录变回未分组）。
 * @param text 工程文件内容
 * @return 归一化后的记录、分组与工程级设置
 * @throws 内容不是合法 JSON 或不含记录数组时抛出错误（调用方负责提示用户）
 */
export const parseProjectText = (text: string): ParsedProject => {
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

  const groups = readGroups(list);
  const parsed: ParsedProject = {
    groups,
    records: keepKnownGroups(normalizeRecords(list), groups),
  };
  // 裸数组里没有 settings 段落 → 不动当前设置（旧工程打开后仍是用户上次的值）
  const settings = Array.isArray(data) ? null : data?.settings;
  if (settings && typeof settings === "object") {
    parsed.settings = { stayFrames: normalizeStayFrames(settings.stayFrames) };
  }
  return parsed;
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
