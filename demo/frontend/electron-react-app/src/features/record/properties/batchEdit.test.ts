/**
 * 批量编辑的逐条改写器（`properties/batchEdit.ts`）：
 * - 契约：**没变化就返回原记录对象**（上层据此判断"这次点击什么都没改"，不压空撤销）；
 * - 说话人名称 / 阵营会跳过自由文本记录，并清掉旧的角色名片（与单条面板一致）；
 * - 查找替换是纯文本替换（不当正则）、可区分大小写，替换前能先算出影响范围；
 * - 显示速度统一归一化到 1~6 档；
 * - 特效改写器与单条「特效」面板共用同一套规则（见 record/effects）。
 */
import {
  DialogueAlign,
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_T_CORP_FILTER,
  EffectVisual,
  Emotion,
  Record as PlotRecord,
} from "@types";
import {
  batchDialogueMutator,
  commonDialogueValue,
  commonTextSpeed,
  countFreeTextRecords,
  countOccurrences,
  effectEnabledMutator,
  planTextReplace,
  replaceAllText,
  replaceDialogueTextMutator,
  transitionMutator,
} from "./batchEdit";

interface RecordOptions {
  text?: string;
  speakerName?: string;
  faction?: string;
  location?: string;
  speed?: number;
  freeText?: boolean;
  speakerC?: { characterID: string; characterName: string }[];
  effects?: EffectVisual[];
}

const makeRecord = (uuid: string, options: RecordOptions = {}): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text: options.text ?? "",
    location: options.location ?? "default",
    speakerC: (options.speakerC ?? []) as PlotRecord["dialogue"]["speakerC"],
    speakerName: options.speakerName ?? "",
    faction: options.faction ?? "",
    align: DialogueAlign.LEFT,
    speed: options.speed ?? 3,
    emotion: Emotion.NORMAL,
    freeText: options.freeText === true,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: options.effects ?? [],
  audioCommands: [],
});

describe("批量改写对话字段", () => {
  test("改说话人名称：写回名字并清掉旧的角色名片", () => {
    const record = makeRecord("a", {
      speakerName: "旧名字",
      speakerC: [{ characterID: "c1", characterName: "旧名字" }],
    });

    const next = batchDialogueMutator({ speakerName: "浮士德" })(record);

    expect(next.dialogue.speakerName).toBe("浮士德");
    // 清掉 speakerC：后端会按名字生成临时名片（与单条面板手动改名一致）
    expect(next.dialogue.speakerC).toEqual([]);
    // 不改别的字段
    expect(next.dialogue.faction).toBe("");
  });

  test("改阵营：同样会清掉旧的角色名片", () => {
    const record = makeRecord("a", {
      faction: "旧阵营",
      speakerC: [{ characterID: "c1", characterName: "浮士德" }],
    });

    const next = batchDialogueMutator({ faction: "N公司" })(record);

    expect(next.dialogue.faction).toBe("N公司");
    expect(next.dialogue.speakerC).toEqual([]);
  });

  test("自由文本记录跳过说话人名称与阵营（没有说话人名片）", () => {
    const record = makeRecord("a", { freeText: true, text: "旁白式文字" });

    expect(batchDialogueMutator({ speakerName: "浮士德" })(record)).toBe(record);
    expect(batchDialogueMutator({ faction: "N公司" })(record)).toBe(record);
  });

  test("自由文本记录的对话内容 / 场景 / 速度照常能改", () => {
    const record = makeRecord("a", { freeText: true, text: "旧" });

    const next = batchDialogueMutator({ text: "新", location: "走廊", speed: 5 })(record);

    expect(next.dialogue.text).toBe("新");
    expect(next.dialogue.location).toBe("走廊");
    expect(next.dialogue.speed).toBe(5);
  });

  test("值没变化时返回原记录（不压空撤销）", () => {
    const record = makeRecord("a", { text: "同一句", speakerName: "浮士德", speed: 4 });

    expect(batchDialogueMutator({ text: "同一句" })(record)).toBe(record);
    expect(batchDialogueMutator({ speakerName: "浮士德" })(record)).toBe(record);
    expect(batchDialogueMutator({ speed: 4 })(record)).toBe(record);
  });

  test("显示速度会被归一化到 1~6 档", () => {
    const record = makeRecord("a", { speed: 3 });

    expect(batchDialogueMutator({ speed: 99 })(record).dialogue.speed).toBe(6);
    expect(batchDialogueMutator({ speed: -5 })(record).dialogue.speed).toBe(1);
    expect(batchDialogueMutator({ speed: 2.4 })(record).dialogue.speed).toBe(2);
  });

  test("台词里的换行原样写回（与单条面板一致，不做 trim）", () => {
    const record = makeRecord("a", { text: "旧" });
    const next = batchDialogueMutator({ text: "第一行\n第二行 " })(record);
    expect(next.dialogue.text).toBe("第一行\n第二行 ");
  });

  test("不改原记录、不改原 dialogue 对象（纯函数）", () => {
    const record = makeRecord("a", { text: "旧" });
    const originalDialogue = record.dialogue;

    const next = batchDialogueMutator({ text: "新" })(record);

    expect(record.dialogue).toBe(originalDialogue);
    expect(originalDialogue.text).toBe("旧");
    expect(next).not.toBe(record);
  });
});

describe("多条记录的共同值", () => {
  test("一致 → 返回这个值；不一致 → undefined", () => {
    const a = makeRecord("a", { speakerName: "浮士德", speed: 4 });
    const b = makeRecord("b", { speakerName: "浮士德", speed: 4 });
    const c = makeRecord("c", { speakerName: "辛克莱", speed: 2 });

    expect(commonDialogueValue([a, b], "speakerName")).toBe("浮士德");
    expect(commonDialogueValue([a, c], "speakerName")).toBeUndefined();
    expect(commonTextSpeed([a, b])).toBe(4);
    expect(commonTextSpeed([a, c])).toBeUndefined();
  });

  test("空列表 → undefined", () => {
    expect(commonDialogueValue([], "text")).toBeUndefined();
    expect(commonTextSpeed([])).toBeUndefined();
  });

  test("数出自由文本记录条数（面板据此说明跳过了几条）", () => {
    expect(
      countFreeTextRecords([
        makeRecord("a", { freeText: true }),
        makeRecord("b"),
        makeRecord("c", { freeText: true }),
      ]),
    ).toBe(2);
  });
});

describe("查找替换", () => {
  test("replaceAllText：替换所有出现位置，替换文本不会被再次匹配", () => {
    expect(replaceAllText("甲乙甲", "甲", "丙")).toBe("丙乙丙");
    // 把 a 换成 aa 不应该无限展开
    expect(replaceAllText("a", "a", "aa")).toBe("aa");
    // 空查找串原样返回
    expect(replaceAllText("abc", "", "x")).toBe("abc");
  });

  test("matchCase 控制是否区分大小写", () => {
    expect(replaceAllText("Faust faust", "faust", "浮士德")).toBe("浮士德 浮士德");
    expect(replaceAllText("Faust faust", "faust", "浮士德", true)).toBe("Faust 浮士德");
  });

  test("countOccurrences 与 replaceAllText 的计数一致", () => {
    expect(countOccurrences("甲乙甲甲", "甲")).toBe(3);
    expect(countOccurrences("甲乙甲甲", "甲", true)).toBe(3);
    expect(countOccurrences("abc", "")).toBe(0);
  });

  test("planTextReplace：先算出会改到几条记录、几处", () => {
    const records = [
      makeRecord("a", { text: "甲乙甲" }),
      makeRecord("b", { text: "丙" }),
      makeRecord("c", { text: "甲" }),
    ];

    expect(planTextReplace(records, "甲")).toEqual({ records: 2, occurrences: 3 });
    expect(planTextReplace(records, "")).toEqual({ records: 0, occurrences: 0 });
  });

  test("replaceDialogueTextMutator：只改命中的台词，没命中返回原记录", () => {
    const hit = makeRecord("a", { text: "露比说：甲乙甲" });
    const miss = makeRecord("b", { text: "没有那段字" });

    const next = replaceDialogueTextMutator("甲", "丙")(hit);
    expect(next.dialogue.text).toBe("露比说：丙乙丙");
    expect(next.dialogue).not.toBe(hit.dialogue);

    expect(replaceDialogueTextMutator("甲", "丙")(miss)).toBe(miss);
  });

  test("替换成空串 = 删除命中的文字", () => {
    const record = makeRecord("a", { text: "（小声）你好" });
    expect(replaceDialogueTextMutator("（小声）", "")(record).dialogue.text).toBe("你好");
  });
});

describe("批量特效改写器", () => {
  test("transitionMutator(true)：设成某转场（清掉其它转场，保留滤镜）", () => {
    const record = makeRecord("a", {
      effects: [
        { type: EFFECT_TYPE_CROSS_DISSOLVE },
        { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      ],
    });

    const next = transitionMutator(EFFECT_TYPE_FADE_FROM_BLACK, true)(record);

    expect(next.effects).toEqual([
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
    ]);
  });

  test("transitionMutator(false)：只删这一种", () => {
    const record = makeRecord("a", {
      effects: [
        { type: EFFECT_TYPE_CROSS_DISSOLVE },
        { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      ],
    });

    const next = transitionMutator(EFFECT_TYPE_CROSS_DISSOLVE, false)(record);
    expect(next.effects).toEqual([{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }]);
  });

  test("没变化时返回原记录（批量里整批都是这个状态时不产生撤销步骤）", () => {
    const record = makeRecord("a", { effects: [{ type: EFFECT_TYPE_CROSS_DISSOLVE }] });
    expect(transitionMutator(EFFECT_TYPE_CROSS_DISSOLVE, true)(record)).toBe(record);
    expect(transitionMutator(EFFECT_TYPE_FADE_FROM_BLACK, false)(record)).toBe(record);
  });

  test("effectEnabledMutator：勾选 / 取消只开关的特效", () => {
    const record = makeRecord("a", { effects: [] });

    const on = effectEnabledMutator(EFFECT_TYPE_T_CORP_FILTER, true)(record);
    expect(on.effects).toEqual([{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }]);

    const off = effectEnabledMutator(EFFECT_TYPE_T_CORP_FILTER, false)(on);
    expect(off.effects).toEqual([]);

    // 已经是目标状态：原记录返回
    expect(effectEnabledMutator(EFFECT_TYPE_T_CORP_FILTER, true)(on)).toBe(on);
  });
});
