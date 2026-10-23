/**
 * @module 项目设置共用逻辑
 *
 * 设置页（设置 → 输出与界面）与剧情编辑 → 全局设置 tab 改的是同一份设置对象
 * （App 层的 projectSettings），两边都要用到的纯逻辑集中在这里，避免两处各写一份、
 * 之后改了一处忘了另一处：
 * 1. 视频尺寸候选项（两边的"视频尺寸"下拉共用同一份列表）；
 * 2. "输出路径"的目录选择对话框（Electron 原生对话框，浏览器环境退化为输入框）；
 * 3. 剧情类型 → 后端 plot 布尔值的换算；
 * 4. 文字显示速度的取值范围与"全局速度 → 所有记录"的换算（"文本"页签的
 *    "显示速度"与"全局设置"页签的"文字显示速度（全局）"共用同一套档位）。
 *
 * 这里不持有 React 状态，方便单独测试。
 */
import { ProjectSettings, Record } from "../types";

/** 视频尺寸候选项（设置页与全局设置 tab 的视频尺寸下拉共用） */
export const VIDEO_SIZE_OPTIONS = [
  { label: "640 × 360", width: 640, height: 360 },
  { label: "854 × 480", width: 854, height: 480 },
  { label: "1280 × 720", width: 1280, height: 720 },
  { label: "1920 × 1080", width: 1920, height: 1080 },
];

/** 剧情类型：剧情（月巴士式剧情模式：立绘 + 黑边 + 0.8 缩放居中的画面） */
export const STORY_TYPE_STORY = "STORY";

/** 剧情类型：人格故事（不叠加立绘/黑边，画面铺满） */
export const STORY_TYPE_PERSONALITY = "PERSONALITY";

/**
 * @function 输出当前视频尺寸对应的下拉取值
 * @param width 视频宽度
 * @param height 视频高度
 * @return 形如 "1920x1080" 的键；不在候选项里时按实际值拼一个（下拉会显示为空）
 */
export const videoSizeKey = (width: number, height: number): string =>
  `${width}x${height}`;

/**
 * @function 解析视频尺寸下拉的取值
 * @param key 形如 "1920x1080" 的键
 * @return 宽高；解析不出数字时返回 null（调用方忽略这次改动）
 */
export const parseVideoSizeKey = (
  key: string,
): { width: number; height: number } | null => {
  const [width, height] = key.split("x").map(Number);
  if (!width || !height || isNaN(width) || isNaN(height)) return null;
  return { width, height };
};

/**
 * @function 剧情类型 → 后端 plot 布尔值
 *
 * 后端 `RenderOfImage.renderPre(record, plot, width, height)` 用 plot 决定画面样式：
 * plot = true 时叠加立绘、临时图片与黑边框，并把背景+角色合成后缩放到 0.8 居中；
 * plot = false（人格故事）时只画背景与 UI/对话。
 *
 * 只有选"剧情"才是 plot = true，其余（人格故事）为 false。
 *
 * @param storyType 设置里的剧情类型
 * @return 是否按剧情模式渲染
 */
export const isPlotMode = (storyType?: string): boolean =>
  storyType === STORY_TYPE_STORY;

/**
 * @function 取当前设置对应的 plot 值
 * @param settings 项目设置
 * @return 是否按剧情模式渲染（设置缺失时按"剧情"处理，与默认设置一致）
 */
export const plotOf = (settings: Pick<ProjectSettings, "storyType">): boolean =>
  isPlotMode(settings?.storyType || STORY_TYPE_STORY);

/** 文字显示速度的档位范围（1 = 极慢 … 6 = 极快，与后端 RenderOfVideo 的档位一致） */
export const TEXT_SPEED_MIN = 1;
export const TEXT_SPEED_MAX = 6;

/** 文字显示速度滑块的步长：一档一档调，避免出现 2.5 这种后端不认识的档位 */
export const TEXT_SPEED_STEP = 1;

/** 默认文字显示速度（与后端 ProjectConfig.DEFAULT_DIALOGUE_SPEED 一致：3 = 标准） */
export const DEFAULT_TEXT_SPEED = 3;

/**
 * @function 归一化文字显示速度
 * 滑块的 value 从 DOM 读出来是字符串，旧工程里也可能是缺失/越界/小数，
 * 统一收敛到 [TEXT_SPEED_MIN, TEXT_SPEED_MAX] 之间的整数档位。
 *
 * @param value 任意来源的速度值（设置里的全局速度 / 记录里的单条速度）
 * @param fallback 完全取不到数字时的兜底档位
 * @return 合法的速度档位
 */
export const normalizeTextSpeed = (
  value: unknown,
  fallback: number = DEFAULT_TEXT_SPEED,
): number => {
  // 空值不算 0（Number(null) === 0）：旧工程/旧 localStorage 里没有这个字段时要用默认档位
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const stepped =
    Math.round((numeric - TEXT_SPEED_MIN) / TEXT_SPEED_STEP) * TEXT_SPEED_STEP +
    TEXT_SPEED_MIN;
  return Math.min(TEXT_SPEED_MAX, Math.max(TEXT_SPEED_MIN, stepped));
};

/* ==================== 结尾停留帧数（工程级） ==================== */

/**
 * 结尾停留帧数：每条记录说完/播完之后再多停多少帧。
 *
 * <p>它是**工程级**设置（不同作品节奏不同），随导出请求发给后端参与时长计算：
 * {@code 时长 = max(文字, 音频, 动画) + stayFrames}。默认值与后端
 * {@code ProjectConfig.DEFAULT_STAY_FRAMES} 保持一致（75 帧 = 2.5 秒 @30fps）。
 */
export const DEFAULT_STAY_FRAMES = 75;

/** 允许范围：0 = 说完立刻切；上限 300 帧（10 秒）已经远超任何合理节奏 */
export const STAY_FRAMES_MIN = 0;
export const STAY_FRAMES_MAX = 300;

/**
 * @function 归一化结尾停留帧数
 *
 * @param value 任意来源的值（localStorage / 工程文件 / 输入框字符串）
 * @param fallback 完全取不到数字时的兜底值
 * @return [0, 300] 之间的整数帧数
 */
export const normalizeStayFrames = (
  value: unknown,
  fallback: number = DEFAULT_STAY_FRAMES,
): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(STAY_FRAMES_MAX, Math.max(STAY_FRAMES_MIN, Math.round(numeric)));
};

/**
 * @function 把全局文字显示速度写到所有记录
 * "全局设置"里的"文字显示速度（全局）"修改后要统一覆盖每条记录的
 * dialogue.speed（"文本"页签里单独调过的速度也会一起被覆盖，这就是"全局"的含义）。
 * 只改 speed 字段，其余字段原样保留；记录对象本身不做原地修改。
 *
 * @param records 当前工程的全部记录
 * @param speed 全局文字显示速度
 * @return 应用了全局速度的新记录数组
 */
export const withGlobalTextSpeed = (records: Record[], speed: number): Record[] => {
  const normalized = normalizeTextSpeed(speed);
  return (records || []).map((record) => ({
    ...record,
    dialogue: { ...record.dialogue, speed: normalized },
    // 记录内容被改过，标脏（与在"文本"页里单条改速度的效果一致）
    isDirty: true,
  }));
};

/**
 * @function 弹出"选择输出目录"对话框
 *
 * Electron 环境走主进程的原生目录选择框；浏览器（直接 npm start）里没有 electronAPI，
 * 退化为 prompt 手动输入，保证功能在开发环境下也能走通。
 *
 * @param currentPath 当前输出路径，浏览器 prompt 时作为默认值
 * @return 选中的目录；用户取消时返回 null
 * @throws 对话框调用失败时抛出错误（调用方提示用户手动输入路径）
 */
export const pickOutputDirectory = async (
  currentPath?: string,
): Promise<string | null> => {
  const api: any = typeof window !== "undefined" ? (window as any).electronAPI : null;

  if (api && typeof api.selectDirectory === "function") {
    const result = await api.selectDirectory();
    if (!result || result.canceled || !result.path) return null;
    return result.path;
  }

  const input = window.prompt("请输入视频输出路径:", currentPath || "");
  const trimmed = (input || "").trim();
  return trimmed || null;
};
