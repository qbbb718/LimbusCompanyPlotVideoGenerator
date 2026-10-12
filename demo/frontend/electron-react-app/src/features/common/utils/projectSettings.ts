/**
 * @module 项目设置共用逻辑
 *
 * 设置页（设置 → 输出与界面）与剧情编辑 → 全局设置 tab 改的是同一份设置对象
 * （App 层的 projectSettings），两边都要用到的纯逻辑集中在这里，避免两处各写一份、
 * 之后改了一处忘了另一处：
 * 1. 视频尺寸候选项（两边的"视频尺寸"下拉共用同一份列表）；
 * 2. "输出路径"的目录选择对话框（Electron 原生对话框，浏览器环境退化为输入框）；
 * 3. 剧情类型 → 后端 plot 布尔值的换算。
 *
 * 这里不持有 React 状态，方便单独测试。
 */
import { ProjectSettings } from "../types";

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
