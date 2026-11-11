/**
 * @module 剧情记录的批量编辑（剧情列表多选 → 「文本」「特效」页签的批量面板）
 *
 * <p>批量编辑的核心是一条**纯函数**：`(record) => record`。**有变化就返回新对象，
 * 没变化就返回原对象**——上层的 `apply` 只在"引用变了"的时候算一条改动，
 * 于是一次"全都已经是这个值"的点击不会往撤销栈里压一步空操作，也不会把整份记录重新渲染一遍。
 *
 * <p>内容上分成两半：<b>文本</b>（说话人名称 / 阵营 / 对话内容 / 场景名称 / 显示速度）与
 * <b>特效</b>（起始转场 / 画面滤镜的勾选状态）。特效的读写规则与「特效」单条面板共用
 * {@link module:record/effects}，这里只把它们再包一层"批量改写器"（没变化就返回原记录）。
 *
 * <h3>几条容易踩的规则</h3>
 * <ul>
 *   <li><b>自由文本不说话</b>：`dialogue.freeText === true` 的记录没有说话人名片，
 *       所以"说话人名称 / 阵营"的批量修改会**跳过**它们（面板会告诉用户跳过了几条）。
 *       对话内容 / 场景 / 速度对它们照常生效。</li>
 *   <li><b>改名字就清角色引用</b>：与单条面板一致（`TextProperties.updateDialogue`），
 *       手动改 `speakerName` / `faction` 时把 `speakerC` 清空，让后端按名字生成临时名片，
 *       否则会继续显示旧角色的名片。</li>
 *   <li><b>速度是档位</b>：一律先过 `normalizeTextSpeed`（1~6 的整数），
 *       与「文本」页签、全局设置同一个口径。</li>
 * </ul>
 */
import type { Dialogue, Record } from "@types";
import { normalizeTextSpeed } from "@features/common/utils/projectSettings";
import { removeEffectType, setEffectEnabled, setTransition } from "../effects";

/**
 * @function 单条记录的批量改写器
 * @param record 原始记录
 * @return 改写后的记录；**没有变化时必须原样返回 `record`**
 */
export type RecordMutator = (record: Record) => Record;

/**
 * @model 一次批量编辑的上下文（编辑器层组装，两个批量面板共用）
 *
 * <p>`apply` 是"真正写下去"的那一步：由 `RecordEditor` 实现——挑出选中的记录逐条套用
 * {@link RecordMutator}，**整批只压一次撤销快照**，并把改过的记录标脏（`isDirty`）。
 */
export interface BatchEditContext {
  /** 选中的记录（按列表顺序；面板从这里读"当前共同值"与三态） */
  records: Record[];
  /** 这些记录在完整列表里的下标（第 1 条记录 = 0；特效面板的"没有上一条"提示要用） */
  indexes: number[];
  /**
   * @function 把一次改动写到所有选中记录
   * @param mutate 逐条改写器（见 {@link RecordMutator}）
   * @return 真正被改写的记录条数（0 = 一条都没变）
   */
  apply: (mutate: RecordMutator) => number;
  /** 只编辑当前记录（清掉多选，回到单条面板） */
  exit: () => void;
}

/** 批量面板能改的对话文本字段 */
export type BatchDialogueField = "speakerName" | "faction" | "location" | "text";

/**
 * @model 对话的批量补丁
 *
 * <p>字段出现（`!== undefined`）= 要改；不出现 = 不动。空字符串是**有效值**
 * （比如把场景名称清成空），面板负责在"输入框还空着"时不给用户点应用。
 */
export interface DialogueBatchPatch {
  /** 说话人名称（自由文本记录会被跳过） */
  speakerName?: string;
  /** 说话人阵营（自由文本记录会被跳过） */
  faction?: string;
  /** 场景名称（地点牌文字） */
  location?: string;
  /** 对话内容（把选中的记录统一改成这一段） */
  text?: string;
  /** 显示速度（1~6 的整数档位，会先归一化） */
  speed?: number;
}

/** 查找替换的选项 */
export interface TextReplaceOptions {
  /** 区分大小写；缺省 false = 不区分（批量改错别字时通常不关心大小写） */
  matchCase?: boolean;
}

/** 查找替换的影响范围（面板在点"应用"之前就显示出来） */
export interface TextReplacePlan {
  /** 会被改写的记录条数 */
  records: number;
  /** 一共替换掉多少处 */
  occurrences: number;
}

/** @function 该记录是不是"自由文本"（没有说话人名片） */
export const isFreeTextRecord = (record: Record): boolean =>
  record?.dialogue?.freeText === true;

/** @function 选中的记录里有几条自由文本（说话人名称 / 阵营会跳过它们） */
export const countFreeTextRecords = (records: Record[]): number =>
  (records || []).filter(isFreeTextRecord).length;

/**
 * @function 取多条记录在某个对话文本字段上的共同值
 *
 * <p>批量面板用它给输入框填初值：所有记录都一样 → 显示这个值；
 * 有任何一条不同 → 返回 undefined（面板显示"多条记录不同"的占位提示）。
 *
 * @param records 选中的记录
 * @param field   字段名
 * @return 共同值；记录为空 / 值不一致时返回 undefined
 */
export function commonDialogueValue(
  records: Record[],
  field: BatchDialogueField,
): string | undefined {
  if (!records || records.length === 0) return undefined;
  const first = records[0]?.dialogue?.[field] ?? "";
  return records.every((record) => (record?.dialogue?.[field] ?? "") === first)
    ? first
    : undefined;
}

/**
 * @function 取多条记录共同的显示速度
 * @param records 选中的记录
 * @return 共同的速度档位；不一致 / 没有记录时返回 undefined
 */
export function commonTextSpeed(records: Record[]): number | undefined {
  if (!records || records.length === 0) return undefined;
  const first = normalizeTextSpeed(records[0]?.dialogue?.speed);
  return records.every(
    (record) => normalizeTextSpeed(record?.dialogue?.speed) === first,
  )
    ? first
    : undefined;
}

/**
 * @function 生成"批量改对话字段"的改写器
 *
 * @param patch 要改的字段（见 {@link DialogueBatchPatch}）
 * @return 逐条套用的改写器；记录本来就是这个值 / 自由文本被跳过时原样返回
 */
export function batchDialogueMutator(patch: DialogueBatchPatch): RecordMutator {
  const hasSpeaker = patch.speakerName !== undefined;
  const hasFaction = patch.faction !== undefined;
  const hasLocation = patch.location !== undefined;
  const hasText = patch.text !== undefined;
  const hasSpeed = patch.speed !== undefined;
  const speed = hasSpeed ? normalizeTextSpeed(patch.speed) : undefined;

  return (record: Record): Record => {
    const dialogue = record?.dialogue;
    if (!dialogue) return record;

    const next: Dialogue = { ...dialogue };
    let changed = false;
    // 说话人名称 / 阵营"真的改了"才清角色引用：只是重复点击同一个值时不该动 speakerC
    let speakerTouched = false;

    // 自由文本没有说话人名片，名字与阵营对它没有意义：跳过（与单条面板不显示这两个输入框一致）
    if (!isFreeTextRecord(record)) {
      if (hasSpeaker && dialogue.speakerName !== patch.speakerName) {
        next.speakerName = patch.speakerName as string;
        speakerTouched = true;
        changed = true;
      }
      if (hasFaction && dialogue.faction !== patch.faction) {
        next.faction = patch.faction as string;
        speakerTouched = true;
        changed = true;
      }
    }

    if (speakerTouched && next.speakerC && next.speakerC.length > 0) {
      next.speakerC = [];
    }

    if (hasLocation && dialogue.location !== patch.location) {
      next.location = patch.location as string;
      changed = true;
    }

    if (hasText && dialogue.text !== patch.text) {
      next.text = patch.text as string;
      changed = true;
    }

    if (hasSpeed && normalizeTextSpeed(dialogue.speed) !== speed) {
      next.speed = speed as number;
      changed = true;
    }

    return changed ? { ...record, dialogue: next } : record;
  };
}

/**
 * @function 把一段文本里所有的 `find` 换成 `replacement`（纯文本，不当正则）
 *
 * <p>刻意**不支持正则**：批量替换台词时用户输入的是普通文字，
 * `.`、`(` 这类字符按字面处理才符合直觉，也避免一个坏正则让整批替换抛异常。
 *
 * @param text        原文本
 * @param find        要查找的内容（空串直接原样返回）
 * @param replacement 替换成什么（可以是空串 = 删除）
 * @param matchCase   是否区分大小写
 */
export function replaceAllText(
  text: string,
  find: string,
  replacement: string,
  matchCase = false,
): string {
  if (!text || !find) return text;

  const source = matchCase ? text : text.toLowerCase();
  const target = matchCase ? find : find.toLowerCase();

  let result = "";
  let cursor = 0;
  let index = source.indexOf(target, cursor);
  // 替换文本里如果再出现 find（比如把 "a" 换成 "aa"），不能无限替换自己：
  // 游标始终按**原文**推进，替换结果只往后追加，不会被再次匹配
  while (index >= 0) {
    result += text.slice(cursor, index) + replacement;
    cursor = index + find.length;
    index = source.indexOf(target, cursor);
  }
  return result + text.slice(cursor);
}

/**
 * @function 一段文本里 `find` 出现了几次
 * @param text      原文本
 * @param find      要查找的内容（空串返回 0）
 * @param matchCase 是否区分大小写
 */
export function countOccurrences(
  text: string,
  find: string,
  matchCase = false,
): number {
  if (!text || !find) return 0;

  const source = matchCase ? text : text.toLowerCase();
  const target = matchCase ? find : find.toLowerCase();

  let count = 0;
  let cursor = 0;
  let index = source.indexOf(target, cursor);
  while (index >= 0) {
    count += 1;
    cursor = index + target.length;
    index = source.indexOf(target, cursor);
  }
  return count;
}

/**
 * @function 批量"查找替换"的影响范围（只统计，不改数据）
 *
 * <p>面板用它实时显示"将在 3 条记录里替换 5 处"，用户点应用之前就知道会改到哪。
 *
 * @param records     选中的记录
 * @param find        要查找的内容
 * @param options     是否区分大小写
 */
export function planTextReplace(
  records: Record[],
  find: string,
  options: TextReplaceOptions = {},
): TextReplacePlan {
  if (!find) return { records: 0, occurrences: 0 };

  let affected = 0;
  let occurrences = 0;
  (records || []).forEach((record) => {
    const count = countOccurrences(
      record?.dialogue?.text ?? "",
      find,
      options.matchCase === true,
    );
    if (count > 0) {
      affected += 1;
      occurrences += count;
    }
  });
  return { records: affected, occurrences };
}

/**
 * @function 生成"批量查找替换对话内容"的改写器
 *
 * @param find        要查找的内容（空串 = 不改任何记录）
 * @param replacement 替换成什么
 * @param options     是否区分大小写
 * @return 逐条套用的改写器
 */
export function replaceDialogueTextMutator(
  find: string,
  replacement: string,
  options: TextReplaceOptions = {},
): RecordMutator {
  return (record: Record): Record => {
    const original = record?.dialogue?.text ?? "";
    if (!find) return record;
    const next = replaceAllText(original, find, replacement, options.matchCase === true);
    if (next === original) return record;
    return { ...record, dialogue: { ...record.dialogue, text: next } };
  };
}

/**
 * @function 生成"批量设置起始转场"的改写器
 *
 * <p>规则与「特效」单条面板完全一致（都走 {@link module:record/effects}）：
 * 勾选 = 清掉其它转场再追加这一种（三种互斥）；取消勾选 = 只删这一种。
 *
 * @param type    转场类型
 * @param enabled true = 设为该转场；false = 取消勾选
 */
export function transitionMutator(type: string, enabled: boolean): RecordMutator {
  return (record: Record): Record => {
    const effects = record?.effects || [];
    const next = enabled
      ? setTransition(effects, type)
      : removeEffectType(effects, type);
    return next === effects ? record : { ...record, effects: next };
  };
}

/**
 * @function 生成"批量勾选 / 取消某个只开关的特效"的改写器（画面滤镜等）
 *
 * @param type    特效类型
 * @param enabled 目标状态
 */
export function effectEnabledMutator(type: string, enabled: boolean): RecordMutator {
  return (record: Record): Record => {
    const effects = record?.effects || [];
    const next = setEffectEnabled(effects, type, enabled);
    return next === effects ? record : { ...record, effects: next };
  };
}
