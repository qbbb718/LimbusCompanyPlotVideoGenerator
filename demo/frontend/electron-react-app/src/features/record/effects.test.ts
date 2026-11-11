/**
 * 记录级特效的读写（`record/effects.ts`）：
 * - 三种起始转场互斥：设一种就清掉其它（`setTransition`），取消只删自己（`removeEffectType`）；
 * - 只开关的特效（画面滤镜 / 镜头摇动）勾选追加、取消删掉（`setEffectEnabled`）；
 * - 多条记录的三态（全勾 / 全不勾 / 不一致）供批量编辑画"横杠"复选框；
 * - **没变化时返回原数组/原记录**：批量编辑靠这个判断"这次点击其实什么都没改"，
 *   否则每次点都会往撤销栈里压一步空操作。
 */
import {
  DialogueAlign,
  EFFECT_TYPE_CAMERA_SHAKE,
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_FADE_FROM_WHITE,
  EFFECT_TYPE_T_CORP_FILTER,
  EffectVisual,
  Emotion,
  Record as PlotRecord,
} from "@types";
import {
  activeTransitionType,
  effectTriState,
  isEffectEnabled,
  isTransitionEffectType,
  removeEffectType,
  setEffectEnabled,
  setTransition,
  TRANSITION_OPTIONS,
} from "./effects";

const makeRecord = (uuid: string, effects: EffectVisual[] = []): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text: "",
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects,
  audioCommands: [],
});

describe("effects 清单", () => {
  test("三种起始转场按「交叉溶解 > 黑屏 > 白屏」的优先级排列（与后端一致）", () => {
    expect(TRANSITION_OPTIONS.map((option) => option.type)).toEqual([
      EFFECT_TYPE_CROSS_DISSOLVE,
      EFFECT_TYPE_FADE_FROM_BLACK,
      EFFECT_TYPE_FADE_FROM_WHITE,
    ]);
  });

  test("只有三种转场算互斥组，画面滤镜 / 镜头摇动都不算", () => {
    expect(isTransitionEffectType(EFFECT_TYPE_CROSS_DISSOLVE)).toBe(true);
    // 类型比较忽略大小写（手写 / 旧工程可能写小写）
    expect(isTransitionEffectType("cross_dissolve")).toBe(true);
    expect(isTransitionEffectType(EFFECT_TYPE_T_CORP_FILTER)).toBe(false);
    expect(isTransitionEffectType(EFFECT_TYPE_CAMERA_SHAKE)).toBe(false);
    expect(isTransitionEffectType(undefined)).toBe(false);
  });
});

describe("effects 读取", () => {
  test("enabled 缺省算开；enabled:false 算关；类型忽略大小写", () => {
    expect(isEffectEnabled([{ type: EFFECT_TYPE_CROSS_DISSOLVE }], EFFECT_TYPE_CROSS_DISSOLVE)).toBe(true);
    expect(
      isEffectEnabled([{ type: EFFECT_TYPE_CROSS_DISSOLVE, enabled: false }], EFFECT_TYPE_CROSS_DISSOLVE),
    ).toBe(false);
    expect(isEffectEnabled([{ type: "cross_dissolve" }], EFFECT_TYPE_CROSS_DISSOLVE)).toBe(true);
    expect(isEffectEnabled(undefined, EFFECT_TYPE_CROSS_DISSOLVE)).toBe(false);
    expect(isEffectEnabled(null, EFFECT_TYPE_CROSS_DISSOLVE)).toBe(false);
  });

  test("activeTransitionType 按优先级取生效的那种（数据里同时有多种时）", () => {
    expect(
      activeTransitionType(
        makeRecord("r", [
          { type: EFFECT_TYPE_FADE_FROM_WHITE },
          { type: EFFECT_TYPE_FADE_FROM_BLACK },
        ]),
      ),
    ).toBe(EFFECT_TYPE_FADE_FROM_BLACK);
    expect(activeTransitionType(makeRecord("r"))).toBeUndefined();
  });

  test("三态：全勾 / 全不勾 / 不一致", () => {
    const on = makeRecord("a", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]);
    const off = makeRecord("b");

    expect(effectTriState([on, on], EFFECT_TYPE_CROSS_DISSOLVE)).toBe("all");
    expect(effectTriState([off, off], EFFECT_TYPE_CROSS_DISSOLVE)).toBe("none");
    expect(effectTriState([on, off], EFFECT_TYPE_CROSS_DISSOLVE)).toBe("mixed");
    // 没有可判断的记录：按"全没勾"处理（不是全勾）
    expect(effectTriState([], EFFECT_TYPE_CROSS_DISSOLVE)).toBe("none");
  });
});

describe("effects 写入", () => {
  test("setTransition：设一种转场会清掉其它转场，非转场特效原样保留", () => {
    const effects: EffectVisual[] = [
      { type: EFFECT_TYPE_CROSS_DISSOLVE },
      { type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true },
    ];

    expect(setTransition(effects, EFFECT_TYPE_FADE_FROM_BLACK)).toEqual([
      { type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true },
      { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
    ]);
  });

  test("setTransition：已经是唯一生效的那种时返回原数组（不产生空撤销）", () => {
    const effects: EffectVisual[] = [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true }];
    expect(setTransition(effects, EFFECT_TYPE_FADE_FROM_BLACK)).toBe(effects);
  });

  test("setTransition：旧的 enabled:false 同类型条目会被替换成启用的一条", () => {
    const effects: EffectVisual[] = [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: false }];
    expect(setTransition(effects, EFFECT_TYPE_FADE_FROM_BLACK)).toEqual([
      { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
    ]);
  });

  test("removeEffectType：只删这一种，其它特效（含其它转场）保留", () => {
    const effects: EffectVisual[] = [
      { type: "SOME_FUTURE_EFFECT" },
      { type: EFFECT_TYPE_CROSS_DISSOLVE },
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ];

    expect(removeEffectType(effects, EFFECT_TYPE_CROSS_DISSOLVE)).toEqual([
      { type: "SOME_FUTURE_EFFECT" },
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);
  });

  test("removeEffectType：本来就没有这种特效时返回原数组", () => {
    const effects: EffectVisual[] = [{ type: EFFECT_TYPE_CAMERA_SHAKE }];
    expect(removeEffectType(effects, EFFECT_TYPE_CROSS_DISSOLVE)).toBe(effects);
  });

  test("setEffectEnabled：勾选追加、取消删除、停用条目只打开开关不重复追加", () => {
    const empty: EffectVisual[] = [];
    expect(setEffectEnabled(empty, EFFECT_TYPE_T_CORP_FILTER, true)).toEqual([
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);

    const disabled: EffectVisual[] = [{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: false }];
    expect(setEffectEnabled(disabled, EFFECT_TYPE_T_CORP_FILTER, true)).toEqual([
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);

    const enabled: EffectVisual[] = [{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }];
    expect(setEffectEnabled(enabled, EFFECT_TYPE_T_CORP_FILTER, false)).toEqual([]);

    // 已开着再勾一次 / 本来就没有再取消：都不产生新数组
    expect(setEffectEnabled(enabled, EFFECT_TYPE_T_CORP_FILTER, true)).toBe(enabled);
    expect(setEffectEnabled(empty, EFFECT_TYPE_T_CORP_FILTER, false)).toBe(empty);
  });
});
