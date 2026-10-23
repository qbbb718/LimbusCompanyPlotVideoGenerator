/**
 * @module 立绘动画 - 预设资产（数据层）
 *
 * 预设 = **一份可复用的动画配方**：参数表 + 一组 clips。三种来源共享同一个文件格式：
 * - L1 程序化预设：代码里内置（`clipEditing.createPresetClip`）；
 * - L2 内置配方：随安装包发布的 JSON（开发者丢文件即生效，不需要改代码）；
 * - L3 用户预设：用户把某条记录里的动画"存为我的预设"。
 *
 * <h2>套用为什么是"内联快照"</h2>
 * 套用时把 clips **深拷贝**进记录，并记下 `sourcePresetId/Version`，之后与预设文件完全解耦。
 * 理由：① 预设升级/删除不会让老工程画面变样；② 后端渲染链路零依赖预设库
 * （导出端永远只读记录本身）；③ 工程文件自包含，拷给别人就能用。
 * 代价是"改预设不回溯旧工程"，所以留了 `sourcePresetId` 供将来做"刷新为最新"。
 *
 * <h2>参数只支持数字</h2>
 * 按需求约定（Q12）：模板里只做 `${name}` 的**数字**替换，不引入表达式引擎——
 * 两端各写一个解释器的复杂度与安全面都不划算。
 */
import type { AnimationClip } from "./animationTypes";
import { ANIMATION_VERSION } from "./animationTypes";

/** 预设文件格式版本（格式变更时 +1，旧文件会被拒绝并给出明确原因） */
export const PRESET_FILE_VERSION = 1;

/** id 规则：与情绪动画素材一致（同时也是未来的文件名/URL 段） */
export const PRESET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 预设里一个可调参数的声明 */
export interface PresetParamDeclaration {
  label?: string;
  unit?: string;
  /** 用户没改时用这个值（**必须**是数字） */
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

/** 一份预设文件 */
export interface PresetFile {
  version: number;
  id: string;
  name: string;
  author?: "builtin" | "user";
  tags?: string[];
  targetKinds?: ("character" | "tempImage")[];
  anchor?: { x: number; y: number };
  params?: Record<string, PresetParamDeclaration>;
  clips: AnimationClip[];
}

/** 解析结果：成功带预设，失败带**人能看懂的原因**（UI 要直接显示给用户） */
export type PresetParseResult =
  | { ok: true; preset: PresetFile }
  | { ok: false; reason: string };

/** 序列化（格式化过，便于人工 review 与版本管理） */
export function serializePreset(preset: PresetFile): string {
  return JSON.stringify(preset, null, 2);
}

/**
 * 解析并校验一份预设文件。
 *
 * <p>校验刻意"宽容但明确"：不认识的字段忽略（向后兼容），但**结构性错误必须拒绝**
 * （缺 id/name/clips、id 非法、clips 里有坏条目），否则会在套用时产生一条静默失效的动画。
 */
export function parsePreset(raw: unknown): PresetParseResult {
  let data: any = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "不是合法的 JSON" };
    }
  }
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "预设内容不是对象" };
  }
  if (typeof data.id !== "string" || !PRESET_ID_PATTERN.test(data.id)) {
    return { ok: false, reason: "id 非法（只允许字母/数字/_/-，长度 1~64）" };
  }
  if (typeof data.name !== "string" || !data.name.trim()) {
    return { ok: false, reason: "缺少名称" };
  }
  if (!Array.isArray(data.clips) || data.clips.length === 0) {
    return { ok: false, reason: "至少要有一条 clip" };
  }
  const clips: AnimationClip[] = [];
  for (const clip of data.clips) {
    if (!clip || typeof clip !== "object") {
      return { ok: false, reason: "clips 里有非法条目" };
    }
    if (typeof clip.durationFrames !== "number" || clip.durationFrames <= 0) {
      return { ok: false, reason: `clip ${clip.id ?? "(无 id)"} 缺少有效的 durationFrames` };
    }
    if (clip.kind !== "preset" && clip.kind !== "keyframes") {
      return { ok: false, reason: `clip ${clip.id ?? "(无 id)"} 的 kind 必须是 preset / keyframes` };
    }
    clips.push({ ...clip, keys: clip.keys ? clip.keys.map((key: any) => ({ ...key })) : undefined });
  }

  const version =
    typeof data.version === "number" && Number.isFinite(data.version)
      ? data.version
      : PRESET_FILE_VERSION;
  return {
    ok: true,
    preset: {
      version,
      id: data.id,
      name: data.name.trim(),
      author: data.author === "builtin" ? "builtin" : "user",
      tags: Array.isArray(data.tags) ? data.tags.filter((tag: unknown) => typeof tag === "string") : [],
      targetKinds: Array.isArray(data.targetKinds) ? data.targetKinds : undefined,
      anchor: data.anchor,
      params: data.params && typeof data.params === "object" ? data.params : {},
      clips,
    },
  };
}

/**
 * 把预设套成一组**新的** clips（深拷贝 + 参数替换 + 来源标记）。
 *
 * @param preset      预设
 * @param overrides   用户改过的参数值（缺省用声明里的 default）
 * @returns 可直接放进记录的 clips；调用方负责把它们内联进 `element.anim`
 */
export function applyPreset(preset: PresetFile, overrides: Record<string, number> = {}): AnimationClip[] {
  const resolved: Record<string, number> = {};
  for (const [key, declaration] of Object.entries(preset.params ?? {})) {
    const value = overrides[key];
    resolved[key] = Number.isFinite(value) ? value : declaration?.default ?? 0;
  }
  // overrides 里给了、但声明里没有的参数也带上（手写预设常见）
  for (const [key, value] of Object.entries(overrides)) {
    if (Number.isFinite(value)) resolved[key] = value;
  }

  return preset.clips.map((clip) => {
    const copy: AnimationClip = {
      ...clip,
      params: clip.params ? { ...clip.params } : undefined,
      channels: clip.channels ? [...clip.channels] : undefined,
      keys: clip.keys ? clip.keys.map((key) => ({ ...key, v: { ...key.v } })) : undefined,
      sourcePresetId: preset.id,
      sourcePresetVersion: preset.version,
    };
    if (copy.params) {
      for (const [key, value] of Object.entries(copy.params)) {
        const substituted = substitute(value, resolved);
        if (substituted === undefined) {
          // 占位符解析不出来（例如手写了 ${seed} 却没声明）：删掉这个参数，
          // 让后端用它自己的默认值，而不是带着 NaN 去算出一堆 NaN
          delete copy.params[key];
        } else {
          copy.params[key] = substituted;
        }
      }
    }
    return copy;
  });
}

/** 反向导出：把记录里的动画存成一份预设（"存为我的预设"） */
export function clipsToPreset(name: string, clips: AnimationClip[], id?: string): PresetFile {
  const presetId = id && PRESET_ID_PATTERN.test(id) ? id : newPresetId(name);
  return {
    version: PRESET_FILE_VERSION,
    id: presetId,
    name: name.trim() || presetId,
    author: "user",
    tags: [],
    params: {},
    clips: clips.map((clip) => {
      const copy: AnimationClip = {
        ...clip,
        params: clip.params ? { ...clip.params } : undefined,
        keys: clip.keys ? clip.keys.map((key) => ({ ...key, v: { ...key.v } })) : undefined,
      };
      // 来源标记属于"这次的内联快照"，不该被带进新预设（否则预设会自我引用）
      delete copy.sourcePresetId;
      delete copy.sourcePresetVersion;
      return copy;
    }),
  };
}

/** 从名字生成合法 id（中文等非 ASCII 字符会被过滤，最后兜底加时间戳保证唯一） */
export function newPresetId(name: string): string {
  const slug = (name || "preset")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-6);
  return `${slug || "preset"}-${suffix}`;
}

/** 一次替换：`"${amplitude}"` → 12；纯数字/其它类型原样返回 */
function substitute(
  value: number | string | boolean,
  resolved: Record<string, number>,
): number | string | boolean | undefined {
  if (typeof value !== "string") return value;
  const match = /^\$\{([A-Za-z0-9_]+)\}$/.exec(value.trim());
  if (!match) return value;
  const resolvedValue = resolved[match[1]];
  return Number.isFinite(resolvedValue) ? resolvedValue : undefined;
}

/** 整套动画装备的版本号（预设里的 clips 会被内联到这个结构里） */
export const PRESET_CLIP_SCHEMA_VERSION = ANIMATION_VERSION;
