/**
 * @module 情绪动画素材（前端数据层）
 *
 * 一"套"动画素材 = 磁盘上 `{dataRoot}/assets/animation-clips/<id>/` 下的
 * `clip.json` + `frames/0001.png ...`。它**可跨记录复用**：多条记录的立绘可以引用同一个 id。
 *
 * <h2>素材是模板，记录是快照</h2>
 * 把素材挂到立绘上时，`frameHolds` / 画布尺寸会被**深拷贝**进记录的 `emotionAnim`
 * （见 {@link emotionAnimFromAsset}）。之后再改素材，老工程画面不会跟着变。
 * 这与预设套用 = 内联快照是同一套哲学（见 `presetFile.ts`），理由是画面稳定性优先：
 * 用户把一条记录调好以后，不该因为别人（或自己）动了素材库而变样。
 *
 * <h2>为什么只有像素靠 id 引用</h2>
 * 帧图几十 MB，塞进工程 JSON 会让"保存工程"变成一次几十兆的字符串序列化（会明显卡顿）。
 * 所以工程文件只存 id 与时序，帧图走 `/assets/**` 静态映射。
 * 代价：工程拷给别人时要连素材一起传 —— 用面板上的「导出动画文件」打成一个 `.lcaf`。
 */
import type { EmotionAnim, LoopMode } from "./animationTypes";
import { ANIMATION_VERSION } from "./animationTypes";

/** 素材 id 白名单（与后端 `AnimationClipStore.ID_PATTERN` 一致） */
export const ANIMATION_CLIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 导入时与后端一致的上限（超过时后端会拒绝，这里用于提前给提示） */
export const ANIMATION_CLIP_MAX_FRAMES = 240;

/** 单素材总时长上限（帧） */
export const ANIMATION_CLIP_MAX_TOTAL_FRAMES = 900;

/** 代表帧配置：哪一张 + **相对头部区域**的摆放 */
export interface AnimationClipPoster {
  /** 显示第几张（0 起） */
  frame: number;
  /** 相对头部区域的水平偏移，单位 = 头部长度（1.0 = 一个头宽） */
  offsetX: number;
  /** 相对头部区域的垂直偏移（+ 向下） */
  offsetY: number;
  /** 缩放倍率（1 = 素材原始像素） */
  scale: number;
}

/** 一次导入的返回（`POST /api/animation-clips/import` 的响应） */
export interface AnimationClipDto {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  /** 帧数 */
  frameCount: number;
  /** 一轮总帧数（Σ frameHolds） */
  totalFrames: number;
  /** 每帧持续帧数 */
  frameHolds: number[];
  /** 播放参数（跟着素材走，剧情编辑页只读） */
  loop?: LoopMode;
  iterations?: number | null;
  startFrame?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  opacity?: number;
  /** 代表帧配置（在资源管理里摆好，跨角色复用） */
  poster?: AnimationClipPoster;
  createdAt: number;
  /** 帧图目录的站内路径，拼 `0001.png` 即可 */
  frameBaseUrl: string;
  /** 封面（第一张）站内路径 */
  coverUrl: string;
  /** 磁盘上真的有几张 */
  framesOnDisk: number;
  /** 磁盘上的帧数少于应有帧数（素材被部分删除/拷漏） */
  missingFrames: boolean;
}

/** 导入接口的完整响应 */
export interface AnimationClipImportResult {
  asset: AnimationClipDto;
  warnings: string[];
}

/**
 * 素材 → 记录里的内联快照。
 *
 * <p>播放参数与代表帧摆放**全部照抄素材**：剧情编辑页只负责"选哪一段"，
 * 不再逐条记录调偏移/淡入淡出（编辑入口统一在资源管理）。
 *
 * @param asset    素材
 * @param defaults 兜底值（只在素材缺字段时用于补齐，正常不该生效）
 */
export function emotionAnimFromAsset(
  asset: AnimationClipDto,
  defaults: Partial<EmotionAnim> = {},
): EmotionAnim {
  const poster = asset.poster ?? { frame: 0, offsetX: 0, offsetY: 0, scale: 1 };
  return {
    version: ANIMATION_VERSION,
    clipId: asset.id,
    name: asset.name,
    canvasWidth: asset.canvasWidth,
    canvasHeight: asset.canvasHeight,
    // 深拷贝：之后改素材不该影响这条记录
    frameHolds: [...asset.frameHolds],
    loop: (asset.loop ?? defaults.loop ?? "once") as LoopMode,
    iterations: asset.iterations ?? defaults.iterations ?? null,
    startFrame: asset.startFrame ?? defaults.startFrame ?? 0,
    offsetX: poster.offsetX ?? 0,
    offsetY: poster.offsetY ?? 0,
    scale: poster.scale ?? 1,
    fadeInFrames: asset.fadeInFrames ?? defaults.fadeInFrames ?? 0,
    fadeOutFrames: asset.fadeOutFrames ?? defaults.fadeOutFrames ?? 0,
    opacity: asset.opacity ?? defaults.opacity ?? 1,
    posterFrame: poster.frame ?? 0,
  };
}

/**
 * 从素材同步**全部**配置（时序 + 播放参数 + 代表帧摆放）。
 *
 * <p>用于"记录里的快照落后于素材"的场景：素材被改过之后，用户主动点一次同步。
 * 之所以不自动同步，是因为改素材不该让已经调好的老工程画面变样（见 `presetFile.ts` 的同一套理由）。
 */
export function syncSequenceFromAsset(anim: EmotionAnim, asset: AnimationClipDto): EmotionAnim {
  return {
    ...emotionAnimFromAsset(asset),
    // 保留记录自己的版本号语义
    version: anim.version ?? ANIMATION_VERSION,
  };
}

/** 两份配置在"会影响画面"的字段上是否等价（用于显示"已与素材不同步"提示） */
export function isSequenceInSync(anim: EmotionAnim, asset: AnimationClipDto | undefined): boolean {
  if (!asset) return false;
  if (anim.clipId !== asset.id) return false;
  if (anim.frameHolds.length !== asset.frameHolds.length) return false;
  if (!anim.frameHolds.every((hold, index) => hold === asset.frameHolds[index])) return false;
  const poster = asset.poster ?? { frame: 0, offsetX: 0, offsetY: 0, scale: 1 };
  if ((anim.posterFrame ?? 0) !== (poster.frame ?? 0)) return false;
  if (Math.abs((anim.offsetX ?? 0) - (poster.offsetX ?? 0)) > 1e-6) return false;
  if (Math.abs((anim.offsetY ?? 0) - (poster.offsetY ?? 0)) > 1e-6) return false;
  if (Math.abs((anim.scale ?? 1) - (poster.scale ?? 1)) > 1e-6) return false;
  if ((anim.loop ?? "once") !== (asset.loop ?? "once")) return false;
  if ((anim.fadeInFrames ?? 0) !== (asset.fadeInFrames ?? 0)) return false;
  if ((anim.fadeOutFrames ?? 0) !== (asset.fadeOutFrames ?? 0)) return false;
  return true;
}

/** 把一串持续帧数收敛到合法范围（每项 ≥ 1，总时长 ≤ 上限） */
export function normalizeFrameHolds(holds: readonly number[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (const raw of holds) {
    const value = Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 1;
    // 逐项累加着卡上限：超了就停在这一项，宁可少播几帧也不要生成一个 30 秒的动画
    if (total + value > ANIMATION_CLIP_MAX_TOTAL_FRAMES) break;
    result.push(value);
    total += value;
  }
  return result;
}

/** 素材总帧数（Σ frameHolds），面板上显示"共 N 帧（x.x 秒）"用 */
export function totalFramesOf(holds: readonly number[]): number {
  let total = 0;
  for (const hold of holds) {
    total += Number.isFinite(hold) && hold > 0 ? hold : 1;
  }
  return total;
}

/** 帧数 → 秒（按项目恒定 30fps），用来给用户一个直观的时长 */
export function framesToSeconds(frames: number): number {
  return frames / 30;
}

/** 循环模式的中文名（面板下拉用） */
export const LOOP_MODE_LABELS: { value: LoopMode; label: string; hint: string }[] = [
  { value: "once", label: "播一次", hint: "播完就消失" },
  { value: "hold", label: "播完停住", hint: "停在最后一张图" },
  { value: "loop", label: "循环", hint: "首尾相接一直播（忽略淡出）" },
  { value: "pingpong", label: "往返", hint: "正着播完再倒着播（忽略淡出）" },
];
