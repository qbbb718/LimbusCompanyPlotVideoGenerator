/**
 * @module 摄像机预设（镜头层效果）注册表
 *
 * 「摄像机」页签里的 **「预设」** 区块由本模块驱动：一种预设 = 注册表里的一条定义
 * （名称 / 说明 / 参数字段）+ 记录里 `effects` 数组中的一条数据（`{ type, enabled, ...params }`）。
 * 面板（`properties/CameraPresets.tsx`）只认注册表，**不认识任何具体类型**。
 *
 * <h2>已注册</h2>
 * | 预设 | 序列化标识（`record.effects[].type`） | 参数 | 求值 |
 * | --- | --- | --- | --- |
 * | 镜头摇动 | `CAMERA_SHAKE` | `amplitude`（屏幕像素，缺省 12）、`periodFrames`（帧，缺省 5） | `preview/cameraShake.ts` |
 *
 * <h2>新增一种预设（不用改面板布局）</h2>
 * <ol>
 *   <li>在 `@types` 加一个 `EFFECT_TYPE_*` 常量，取值与后端 `EffectVisual.TYPE_*` 一致；</li>
 *   <li>在下面的 {@link CAMERA_PRESETS} 里追加一条定义（`label` / `description` / `params`，
 *       需要分组就填 `group`）；</li>
 *   <li>需要一个求值模块（照着 `cameraShake.ts` 写，与后端公式对拍），
 *       并在 `RecordPreview` 里把它的结果叠到世界层相机上。</li>
 * </ol>
 * 开关勾选、参数读写、分组小标题、缺省值回落全部由本模块的通用函数处理。
 *
 * <h2>为什么数据仍然写在 {@code record.effects}</h2>
 * 镜头摇动原本是「特效」页签里的一条，数据一直是 `record.effects` 里的一条
 * `{type:"CAMERA_SHAKE"}`（后端 {@code EffectVisual} 也这么读）。这次只搬 UI、**不动存储格式**：
 * 旧工程里已勾选的摇动打开后照样是勾着的，导出也照样生效——不需要任何迁移脚本。
 * 新的预设沿用同一条约定：`record.effects` 是"渲染时要额外做的事"的列表，按 `type` 区分。
 */
import type { EffectVisual } from "@types";
import { EFFECT_TYPE_CAMERA_SHAKE } from "@types";
import { matchesEffectType } from "./effectType";
import {
  DEFAULT_CAMERA_SHAKE_AMPLITUDE,
  DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
  DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
} from "./cameraShake";

/**
 * 一个参数控件的描述：面板据此渲染数字框，不需要为每种预设写一段 UI。
 *
 * <p>约定：面板显示的值必须落在 `[min, max]` 里，记录里的值**小于下限**时按"未设置"回落到
 * {@link defaultValue}（这样 `0` 也能当合法值用，例如"渐入 0 帧 = 不渐入"）。
 */
export interface CameraPresetParam {
  /** 写回 `record.effects[i][key]` 的字段名（与后端 `EffectVisual` 的字段一致） */
  key: string;
  /** 面板上的名称 */
  label: string;
  /** 单位（"px" / "帧"）；留空则不显示 */
  unit?: string;
  /** 数字框下限（含）。**0 也合法**的参数（持续时长 / 渐入 / 渐出）把下限设成 0 */
  min: number;
  /** 数字框上限（含） */
  max: number;
  /** 缺省值：记录里没写这个字段时，面板显示它、运行时也用它 */
  defaultValue: number;
  /** 只允许整数（帧数用 true） */
  integer?: boolean;
  /** 悬浮提示（讲清这个参数的实际观感） */
  hint?: string;
}

/** 一种摄像机预设（镜头层的动态效果） */
export interface CameraPresetDefinition {
  /**
   * 序列化标识 = 后端 `EffectVisual.TYPE_*`，也写在 `record.effects[].type` 里。
   *
   * <p>**改名等于改数据格式**：旧工程里存的是旧值，改名后那些记录就不再生效，
   * 必须同时提供迁移逻辑。正常的"新增一种预设"只是加一个新常量。
   */
  type: string;
  /** 面板上的图标（一个 emoji，和属性页签的用法一致） */
  emoji: string;
  /** 面板上的名称（同时作为复选框的无障碍名称） */
  label: string;
  /** 面板说明：做什么、影响哪些层、默认值/注意点 */
  description: string;
  /**
   * 分组名：同组的预设在面板上归到一个小标题下；缺省 = 不分组。
   *
   * <p>预设变多时（推拉 / 旋转 / 晃动…）直接填名字即可，面板自动分节，布局骨架不用动。
   */
  group?: string;
  /** 参数字段；空数组 = 纯开关 */
  params: CameraPresetParam[];
}

/** 镜头摇动：按帧轻晃"看世界的那台相机"（只影响背景 / 立绘 / 临时图片） */
export const CAMERA_SHAKE_PRESET: CameraPresetDefinition = {
  type: EFFECT_TYPE_CAMERA_SHAKE,
  emoji: "📳",
  label: "镜头摇动",
  description: "手持晃动，只影响背景 / 立绘 / 临时图片（UI 与黑边不动）。",
  params: [
    {
      key: "amplitude",
      label: "幅度",
      unit: "px",
      min: 1,
      max: 60,
      defaultValue: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      hint: "晃动幅度（屏幕像素）。镜头推近时不会跟着放大",
    },
    {
      key: "periodFrames",
      label: "周期",
      unit: "帧",
      min: 1,
      max: 60,
      integer: true,
      defaultValue: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      hint: "晃一个来回用多少帧；越小抖得越快（30fps 下 5 帧 ≈ 0.17 秒）",
    },
    {
      key: "durationFrames",
      label: "持续",
      unit: "帧",
      min: 0,
      max: 600,
      integer: true,
      defaultValue: DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
      hint: "抖动持续多少帧；0 = 整条记录。超出记录长度时按记录长度算",
    },
    {
      key: "fadeInFrames",
      label: "渐入",
      unit: "帧",
      min: 0,
      max: 120,
      integer: true,
      defaultValue: DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
      hint: "从静止到满幅度用多少帧；0 = 一开始就是满幅度",
    },
    {
      key: "fadeOutFrames",
      label: "渐出",
      unit: "帧",
      min: 0,
      max: 120,
      integer: true,
      defaultValue: DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
      hint: "从满幅度回到静止用多少帧，对齐抖动结束（持续 = 0 时对齐记录结尾）；0 = 不渐出",
    },
  ],
};

/**
 * 已注册的摄像机预设——数组顺序就是面板顺序。
 *
 * <p>以后加"推拉 / 旋转 / 晃动"等预设：往后追加一条定义即可，面板与数据读写都不用改。
 */
export const CAMERA_PRESETS: CameraPresetDefinition[] = [CAMERA_SHAKE_PRESET];

/* ===================== 数据读写（所有预设共用，与具体类型无关） ===================== */

/** 从任意对象里读一个字段（`EffectVisual` 没有索引签名，统一在这里收口） */
const paramOf = (entry: EffectVisual, key: string): unknown =>
  (entry as unknown as { [field: string]: unknown })[key];

/**
 * @function 记录里这个预设的条目（不论启用与否）
 *
 * <p>类型比较忽略大小写（见 {@link matchesEffectType}）；同类型有多条时取第一条，
 * 与后端 `CameraShake.configOf` / `StartTransition.kindOf` 的遍历顺序一致。
 *
 * @param effects 记录的特效列表
 * @param type    预设的序列化标识
 * @returns 那一条数据；没有则 undefined
 */
export function presetEntryOf(
  effects: EffectVisual[] | null | undefined,
  type: string,
): EffectVisual | undefined {
  if (!Array.isArray(effects)) return undefined;
  return effects.find((effect) => effect && matchesEffectType(effect.type, type));
}

/**
 * @function 这个预设是否已启用
 *
 * <p>`enabled` 缺省视为启用（旧工程里手写的 `{"type":"CAMERA_SHAKE"}` 也算勾选），
 * 与后端 `EffectVisual.enabled = true` 的初值一致。
 *
 * @param effects 记录的特效列表
 * @param type    预设的序列化标识
 */
export function isPresetEnabled(
  effects: EffectVisual[] | null | undefined,
  type: string,
): boolean {
  const entry = presetEntryOf(effects, type);
  return entry ? entry.enabled !== false : false;
}

/**
 * @function 勾选 / 取消一个预设
 *
 * <p>勾选时写回的条目形状与迁移前的「特效」页签**完全一致**（`{ type, enabled: true }`，
 * 不带参数），所以数据格式、后端渲染、旧工程都保持不变；参数由 {@link withPresetParam}
 * 另外写。取消勾选 = 把这一条删掉（这也是迁移前的行为，`enabled:false` 的条目不会被写进工程）。
 *
 * <p>例外：如果记录里已经有一条**停用**的同类型条目（例如手改过 `enabled:false`），
 * 勾选时只把开关打开，保留它已调好的参数。
 *
 * @param effects 记录的特效列表
 * @param type    预设的序列化标识
 * @param enabled 目标状态
 * @returns 新的 effects 数组（没有变化时返回原数组，便于浅比较）
 */
export function togglePresetEffect(
  effects: EffectVisual[] | null | undefined,
  type: string,
  enabled: boolean,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  const entry = presetEntryOf(list, type);

  if (enabled) {
    if (!entry) return [...list, { type, enabled: true }];
    if (entry.enabled === false) {
      return list.map((effect) => (effect === entry ? { ...effect, enabled: true } : effect));
    }
    return list; // 已经启用：不制造新数组
  }

  if (!entry) return list;
  return list.filter((effect) => effect !== entry);
}

/**
 * @function 改一个预设参数
 *
 * <p>只改"这一条"，其它特效与同条上的其它字段原样保留；值没变化时返回原数组
 * （避免每次重渲染都换引用、让撤销栈出现空步骤）。
 *
 * @param effects 记录的特效列表
 * @param type    预设的序列化标识
 * @param key     参数字段名（`CameraPresetParam.key`）
 * @param value   新值（面板已经夹过范围）
 */
export function withPresetParam(
  effects: EffectVisual[] | null | undefined,
  type: string,
  key: string,
  value: number,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  if (!presetEntryOf(list, type)) return list;

  let changed = false;
  const next = list.map((effect) => {
    if (!effect || !matchesEffectType(effect.type, type)) return effect;
    if (paramOf(effect, key) === value) return effect;
    changed = true;
    return { ...effect, [key]: value };
  });
  return changed ? next : list;
}

/**
 * @function 面板显示用的参数值
 *
 * @param entry 该预设的记录条目（没有则传 undefined）
 * @param param 参数定义
 * @returns 数据里落在 `[min, +∞)` 的数字；缺失 / 非数字 / 小于下限时回落
 *          {@link CameraPresetParam.defaultValue}
 */
export function presetParamValue(
  entry: EffectVisual | undefined,
  param: CameraPresetParam,
): number {
  if (!entry) return param.defaultValue;
  const raw = paramOf(entry, param.key);
  return typeof raw === "number" && Number.isFinite(raw) && raw >= param.min
    ? Math.min(raw, param.max)
    : param.defaultValue;
}

/** 面板上的一个分组 */
export interface CameraPresetGroup {
  /** 分组名；undefined = 不分组（直接平铺） */
  group?: string;
  presets: CameraPresetDefinition[];
}

/**
 * @function 按 `group` 把预设整理成面板分组
 *
 * <p>只合并**相邻**的同名分组（注册顺序即面板顺序，不打乱），未填 `group` 的条目自成一组。
 * 面板据此渲染"小标题 + 卡片"，新增预设时布局不用动。
 *
 * @param presets 预设清单（通常是 {@link CAMERA_PRESETS}）
 */
export function groupPresets(
  presets: CameraPresetDefinition[],
): CameraPresetGroup[] {
  const groups: CameraPresetGroup[] = [];
  presets.forEach((preset) => {
    const last = groups[groups.length - 1];
    if (last && last.group === preset.group) last.presets.push(preset);
    else groups.push({ group: preset.group, presets: [preset] });
  });
  return groups;
}
