/**
 * 镜头自动跟随说话人（纯运算）单测。
 *
 * 这里锁的是需求里那几条硬规则：
 * 1. **只在两种情况下跟随**：背景图片比 16:9 更宽 / 镜头被推进（zoom > 1），
 *    并且说话人确实已经不在可视范围里；
 * 2. **触发时机只有两个**：移动说话人的立绘、切换说话人；
 * 3. 跟随时说话人立绘**水平居中**，角色在边缘时镜头**贴着背景边缘、不越出背景**；
 * 4. 垂直方向不强制居中，只做最小必要调整；镜头缩放（zoom）从不被改；
 * 5. 立绘不存在 / 旁白 / 自由文本 / 人格故事模式 → 什么都不做（不报错）。
 *
 * 夹具里的立绘特意取 `length = 183`（后端默认头长）：此时裁剪缩放 = 1，
 * 脸框边长恒为 183、脸框中心 = 立绘左上角 + (91.5, 91.5)，下面所有期望值都能手算。
 */
import {
  DialogueAlign,
  Emotion,
  type BackgroundVisual,
  type CharacterVisual,
  type Record as PlotRecord,
  type RecordCamera,
} from "@types";
import {
  autoFollowSpeaker,
  backgroundBoundsOf,
  followTriggerOf,
  hasWideBackground,
  speakerBodyRect,
  speakerCharacterIDOf,
  speakerCharacterOf,
  speakerSignature,
} from "./cameraFollow";
import type { ImageSizeLookup } from "./cameraFollow";
import {
  CANVAS_WORLD_RECT,
  characterHeadBox,
  type ImageSize,
} from "./previewLayout";

/* ============================ 夹具 ============================ */

/** 说话人立绘的原图尺寸（400×600）：立绘矩形 = 400×600，中心比脸框中心靠右 108.5px */
const PORTRAIT_SIZE: ImageSize = { width: 400, height: 600 };
/** 2.35:1 的宽图背景（比 16:9 宽） */
const WIDE_BG_SIZE: ImageSize = { width: 2350, height: 1000 };
/** 标准 16:9 背景 */
const BASE_BG_SIZE: ImageSize = { width: 1920, height: 1080 };

/** 按图层 key 查尺寸（key 与 previewLayout.sceneLayerKey 一致） */
const sizesOf =
  (map: Record<string, ImageSize>): ImageSizeLookup =>
  (key) =>
    map[key];

/** 说话人：罗佳，171cm，裁剪框 183 → 缩放 1（脸框 183×183，中心 = 左上角 + (91.5, 91.5)） */
const makeSpeaker = (
  overrides: Partial<CharacterVisual> = {},
): CharacterVisual => ({
  chara: {
    characterID: "c1",
    characterName: "罗佳",
    height: 171,
    faction: "未设定",
    colorBg: "#FFFFFF",
    colorText: "#000000",
  },
  portrait: {
    portraitID: "p1",
    characterID: "c1",
    imagePath: "characters/c1/p1.png",
    portName: "默认立绘",
    emotion: Emotion.NORMAL,
    faceX: 0,
    faceY: 0,
    length: 183,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
  },
  posX: 960,
  posY: 0,
  adjX: 0,
  adjY: 0,
  scale: 1,
  dim: false,
  ...overrides,
});

/** 背景视觉元素 */
const makeBackground = (
  overrides: Partial<BackgroundVisual> = {},
): BackgroundVisual => ({
  background: { uuid: "b1", path: "backgrounds/b1.png", name: "街道" },
  posX: 0,
  posY: 0,
  scale: 1,
  visible: true,
  ...overrides,
});

/** 说话人引用（speakerC[0]） */
const speakerRef = (characterID = "c1", characterName = "罗佳") => ({
  characterID,
  characterName,
  height: 171,
  faction: "未设定",
  colorBg: "#FFFFFF",
  colorText: "#000000",
});

/** 一条"罗佳在说话"的记录 */
const makeRecord = (overrides: Partial<PlotRecord> = {}): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text: "台词",
    location: "default",
    speakerC: [speakerRef()],
    speakerName: "罗佳",
    faction: "未设定",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [makeSpeaker()],
  tempImages: [],
  effects: [],
  audioCommands: [],
  ...overrides,
});

/** 一条"旁白"的记录（没有说话人） */
const makeNarratorRecord = (
  overrides: Partial<PlotRecord> = {},
): PlotRecord => {
  const base = makeRecord(overrides);
  return {
    ...base,
    dialogue: { ...base.dialogue, speakerC: [], speakerName: "旁白" },
  };
};

/** 立绘尺寸查询（只有 character:0 有尺寸） */
const PORTRAIT_SIZES = sizesOf({ "character:0": PORTRAIT_SIZE });

/* ============================ 说话人 ============================ */

describe("说话人是谁", () => {
  test("取 speakerC[0] 对应的那张立绘", () => {
    const speaker = speakerCharacterOf(makeRecord());
    expect(speaker?.index).toBe(0);
    expect(speaker?.character.chara.characterName).toBe("罗佳");
    expect(speakerCharacterIDOf(makeRecord())).toBe("c1");
  });

  test("角色在立绘列表里排第二也能找到", () => {
    const other = makeSpeaker({
      chara: { ...makeSpeaker().chara, characterID: "c9", characterName: "辛克莱" },
    });
    const record = makeRecord({ chars: [other, makeSpeaker()] });
    expect(speakerCharacterOf(record)?.index).toBe(1);
  });

  test("旁白 / 自由文本 / 手填名字都没有可跟随的对象", () => {
    const narrator = makeNarratorRecord();
    expect(speakerCharacterOf(narrator)).toBeNull();
    expect(speakerSignature(narrator)).toBe("name:旁白");

    const freeText = makeRecord();
    freeText.dialogue = {
      ...freeText.dialogue,
      freeText: true,
      speakerC: [],
      speakerName: "自由文本",
    };
    expect(speakerCharacterOf(freeText)).toBeNull();
    expect(speakerSignature(freeText)).toBe("freeText");

    const manual = makeRecord();
    manual.dialogue = { ...manual.dialogue, speakerC: [], speakerName: "路人甲" };
    expect(speakerCharacterOf(manual)).toBeNull();
    expect(speakerSignature(manual)).toBe("name:路人甲");
  });

  test("说话人不在立绘列表里 → 有说话人但没有立绘", () => {
    const record = makeRecord({ chars: [] });
    expect(speakerCharacterIDOf(record)).toBe("c1");
    expect(speakerCharacterOf(record)).toBeNull();
  });

  test("同一角色有多张立绘时认第一张", () => {
    const record = makeRecord({
      chars: [makeSpeaker({ adjX: -300 }), makeSpeaker({ adjX: 300 })],
    });
    expect(speakerCharacterOf(record)?.index).toBe(0);
    expect(speakerCharacterOf(record)?.character.adjX).toBe(-300);
  });
});

/* ============================ 触发时机 ============================ */

describe("触发时机：只有移动立绘 / 切换说话人", () => {
  test("换一位说话人 → speaker", () => {
    const next = makeRecord();
    next.dialogue = {
      ...next.dialogue,
      speakerC: [speakerRef("c2", "辛克莱")],
      speakerName: "辛克莱",
    };
    expect(followTriggerOf(makeRecord(), next)).toBe("speaker");
  });

  test("切成旁白 / 自由文本也算换人", () => {
    expect(followTriggerOf(makeRecord(), makeNarratorRecord())).toBe("speaker");

    const freeText = makeRecord();
    freeText.dialogue = { ...freeText.dialogue, freeText: true };
    expect(followTriggerOf(makeRecord(), freeText)).toBe("speaker");
  });

  test("挪动说话人的立绘（X / Y / 缩放 / 裁剪框）→ portrait", () => {
    const moved = makeRecord({ chars: [makeSpeaker({ adjX: 240 })] });
    expect(followTriggerOf(makeRecord(), moved)).toBe("portrait");

    const lifted = makeRecord({ chars: [makeSpeaker({ adjY: -120 })] });
    expect(followTriggerOf(makeRecord(), lifted)).toBe("portrait");

    const scaled = makeRecord({ chars: [makeSpeaker({ scale: 1.4 })] });
    expect(followTriggerOf(makeRecord(), scaled)).toBe("portrait");

    const base = makeRecord();
    const recropped = makeRecord({
      chars: [
        makeSpeaker({
          portrait: { ...base.chars[0].portrait, faceX: 200, length: 400 },
        }),
      ],
    });
    expect(followTriggerOf(base, recropped)).toBe("portrait");
  });

  test("其它改动都不触发：台词 / 压暗 / 背景 / 镜头 / 临时图片", () => {
    const base = makeRecord();

    const textChanged = makeRecord();
    textChanged.dialogue = { ...textChanged.dialogue, text: "改了台词" };
    expect(followTriggerOf(base, textChanged)).toBeNull();

    const dimmed = makeRecord({ chars: [makeSpeaker({ dim: true })] });
    expect(followTriggerOf(base, dimmed)).toBeNull();

    const bgChanged = makeRecord({ bg: [makeBackground()] });
    expect(followTriggerOf(base, bgChanged)).toBeNull();

    const cameraChanged = makeRecord({
      camera: { centerX: 1200, centerY: 540, zoom: 2 },
    });
    expect(followTriggerOf(base, cameraChanged)).toBeNull();

    const tempAdded = makeRecord({
      tempImages: [
        { uuid: "t1", imagePath: "temp/t1.png", posX: 0, posY: 0, scale: 1, dim: false },
      ],
    });
    expect(followTriggerOf(base, tempAdded)).toBeNull();
  });

  test("新增 / 删除说话人的立绘不算移动，不触发", () => {
    const withoutPortrait = makeRecord({ chars: [] });
    expect(followTriggerOf(withoutPortrait, makeRecord())).toBeNull();
    expect(followTriggerOf(makeRecord(), withoutPortrait)).toBeNull();
  });

  test("没有改动前的记录 → 不触发", () => {
    expect(followTriggerOf(null, makeRecord())).toBeNull();
    expect(followTriggerOf(undefined, makeRecord())).toBeNull();
  });
});

/* ============================ 背景范围 ============================ */

describe("背景图片的实际范围与比例", () => {
  test("没有背景时退回画布矩形", () => {
    expect(backgroundBoundsOf(makeRecord())).toEqual(CANVAS_WORLD_RECT);
    expect(backgroundBoundsOf(makeRecord(), sizesOf({}))).toEqual(CANVAS_WORLD_RECT);
  });

  test("16:9 背景 = 整块画布", () => {
    const record = makeRecord({ bg: [makeBackground()] });
    expect(
      backgroundBoundsOf(record, sizesOf({ "background:0": BASE_BG_SIZE })),
    ).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  test("2.35:1 宽图按 16:9 等比放进去：上下留黑，范围变矮", () => {
    const record = makeRecord({ bg: [makeBackground()] });
    expect(
      backgroundBoundsOf(record, sizesOf({ "background:0": WIDE_BG_SIZE })),
    ).toEqual({ x: 0, y: 132, w: 1920, h: 817 });
  });

  test("放大到 1.4 倍后比画布更大（镜头才有地方摇）", () => {
    const record = makeRecord({ bg: [makeBackground({ scale: 1.4 })] });
    expect(
      backgroundBoundsOf(record, sizesOf({ "background:0": WIDE_BG_SIZE })),
    ).toEqual({ x: -384, y: -32, w: 2688, h: 1144 });
  });

  test("多张背景取并集（含各自的 posX/posY 偏移）", () => {
    const record = makeRecord({
      bg: [makeBackground(), makeBackground({ posX: 960 })],
    });
    expect(
      backgroundBoundsOf(
        record,
        sizesOf({ "background:0": BASE_BG_SIZE, "background:1": BASE_BG_SIZE }),
      ),
    ).toEqual({ x: 0, y: 0, w: 2880, h: 1080 });
  });

  test("只有宽于 16:9 的背景才算宽图", () => {
    const wide = makeRecord({ bg: [makeBackground()] });
    expect(
      hasWideBackground(wide, sizesOf({ "background:0": WIDE_BG_SIZE })),
    ).toBe(true);
    expect(
      hasWideBackground(wide, sizesOf({ "background:0": BASE_BG_SIZE })),
    ).toBe(false);
    // 竖图不算（比例小于 16:9）
    expect(
      hasWideBackground(
        wide,
        sizesOf({ "background:0": { width: 1080, height: 1920 } }),
      ),
    ).toBe(false);
    // 尺寸还不知道 → 按"没有宽图"处理
    expect(hasWideBackground(wide)).toBe(false);
  });

  test("立绘矩形：有原图尺寸就用真实矩形，没有就退回头部框", () => {
    const character = makeSpeaker({ adjX: 100 });
    expect(speakerBodyRect(character, PORTRAIT_SIZE)).toEqual({
      x: 1060,
      y: 221,
      w: 400,
      h: 600,
    });
    expect(speakerBodyRect(character)).toEqual(characterHeadBox(character));
  });
});

/* ============================ 自动跟随 ============================ */

describe("自动跟随：开关与前置条件", () => {
  test("开关没勾 → 一律不动", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };
    const record = makeRecord({
      chars: [makeSpeaker({ adjX: 700 })],
      camera,
    });
    const outcome = autoFollowSpeaker({
      record,
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 600 })], camera }),
      enabled: false,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toBe("disabled");
    // 没改时返回的就是入参本身（调用方可以据此直接跳过）
    expect(outcome.record).toBe(record);
  });

  test("人格故事模式（不渲染立绘）→ 不跟随", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjX: 700 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 600 })], camera }),
      enabled: true,
      plot: false,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(outcome).toMatchObject({ applied: false, reason: "not-plot" });
  });

  test("说话人有立绘才谈得上居中：没立绘 / 没说话人都跳过且不报错", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };

    // 说话人是 c1，但立绘列表里没有 c1 → no-portrait（触发时机是"切换说话人"）
    const noPortrait = autoFollowSpeaker({
      record: makeRecord({ chars: [], camera }),
      previous: makeNarratorRecord({ chars: [] }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(noPortrait).toMatchObject({ applied: false, reason: "no-portrait" });

    // 旁白：没有说话人 → no-speaker
    const narrator = autoFollowSpeaker({
      record: makeNarratorRecord({ camera }),
      previous: makeRecord({ camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(narrator).toMatchObject({ applied: false, reason: "no-speaker" });
  });

  test("不是移动立绘 / 切换说话人 → 不跟随", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };
    // 只改了 camera（手动推镜头）：这条路径不触发自动跟随
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjX: 700 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 700 })] }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(outcome).toMatchObject({ applied: false, reason: "no-trigger" });
  });

  test("说话人本来就在画面里 → 不跟随", () => {
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjX: 0 })] }),
      previous: makeRecord({ chars: [makeSpeaker({ adjX: -200 })] }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(outcome).toMatchObject({ applied: false, reason: "in-view" });
  });

  test("说话人在画面外，但背景不宽、镜头也没推进 → 不跟随", () => {
    const outcome = autoFollowSpeaker({
      record: makeRecord({ bg: [makeBackground()], chars: [makeSpeaker({ adjX: 1200 })] }),
      previous: makeRecord({ bg: [makeBackground()], chars: [makeSpeaker({ adjX: 1100 })] }),
      enabled: true,
      sizeOf: sizesOf({ "background:0": BASE_BG_SIZE, "character:0": PORTRAIT_SIZE }),
    });
    expect(outcome).toMatchObject({ applied: false, reason: "conditions-not-met" });
  });
});

describe("自动跟随：水平居中 + 背景边界", () => {
  test("镜头推进说话人出画 → 立绘水平居中，缩放不变", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };
    const outcome = autoFollowSpeaker({
      record: makeRecord({
        bg: [makeBackground({ scale: 1.4 })],
        chars: [makeSpeaker({ adjX: 500 })],
        camera,
      }),
      previous: makeRecord({
        bg: [makeBackground({ scale: 1.4 })],
        chars: [makeSpeaker({ adjX: 400 })],
        camera,
      }),
      enabled: true,
      sizeOf: sizesOf({ "background:0": WIDE_BG_SIZE, "character:0": PORTRAIT_SIZE }),
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.trigger).toBe("portrait");
    // 立绘矩形 x = 960 + 500 = 1460、宽 400 → 中心 1660；背景范围够大，可以真的居中
    expect(outcome.record.camera).toEqual({
      centerX: 1660,
      centerY: 540,
      zoom: 2,
    });
  });

  test("角色在画面边缘 → 镜头贴着背景边缘，不越出背景范围", () => {
    // 宽图放大 1.4 倍后：范围 x = -384、宽 2688；zoom = 1 的取景框宽 1920
    // → 取景中心最多只能到 -384 + 2688 - 960 = 1344（右边缘正好贴住背景右边缘）
    const outcome = autoFollowSpeaker({
      record: makeRecord({
        bg: [makeBackground({ scale: 1.4 })],
        chars: [makeSpeaker({ adjX: 1200 })],
      }),
      previous: makeRecord({
        bg: [makeBackground({ scale: 1.4 })],
        chars: [makeSpeaker({ adjX: 1100 })],
      }),
      enabled: true,
      sizeOf: sizesOf({ "background:0": WIDE_BG_SIZE, "character:0": PORTRAIT_SIZE }),
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.record.camera).toEqual({ centerX: 1344, centerY: 540, zoom: 1 });
    // 取景框右边缘 = 背景右边缘（贴边），左边缘仍在背景内
    expect(1344 + 960).toBeCloseTo(-384 + 2688, 6);
    expect(1344 - 960).toBeGreaterThanOrEqual(-384);
  });

  test("没有背景时按画布夹取：镜头不跑到画布外", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 2 };
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjX: 700 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 600 })], camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });

    // 立绘中心 = 1860，但 zoom = 2 的取景框宽 960、画布宽 1920 → 中心最多 1440
    expect(outcome.record.camera).toEqual({ centerX: 1440, centerY: 540, zoom: 2 });
  });

  test("背景只有 1920 宽（与 zoom = 1 的取景框一样宽）→ 无处可挪，不改记录", () => {
    const outcome = autoFollowSpeaker({
      record: makeRecord({
        bg: [makeBackground()],
        chars: [makeSpeaker({ adjX: 1200 })],
      }),
      previous: makeRecord({
        bg: [makeBackground()],
        chars: [makeSpeaker({ adjX: 1100 })],
      }),
      enabled: true,
      sizeOf: sizesOf({ "background:0": WIDE_BG_SIZE, "character:0": PORTRAIT_SIZE }),
    });
    expect(outcome).toMatchObject({ applied: false, reason: "unchanged" });
  });
});

describe("自动跟随：垂直方向只做最小必要调整", () => {
  test("脸在上方出画 → 镜头往上挪刚好够用的距离", () => {
    // zoom = 3 时取景框 = (640, 360, 640, 360)，脸框中心 y = 312.5 在取景框上方 47.5px
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 3 };
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjY: 0 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjY: 20 })], camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.record.camera).toEqual({
      // 水平仍然居中（立绘中心 1160）
      centerX: 1160,
      // 540 - 47.5：只补"刚好让脸进画面"的那一点，不把人物拉到垂直中间
      centerY: 492.5,
      zoom: 3,
    });
  });

  test("脸在下方出画 → 镜头往下挪", () => {
    const camera: RecordCamera = { centerX: 960, centerY: 540, zoom: 3 };
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjY: 700 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjY: 680 })], camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });

    // 脸框中心 y = 221 + 700 + 91.5 = 1012.5；取景框下边缘 720 → 往下 292.5
    expect(outcome.record.camera).toEqual({ centerX: 1160, centerY: 832.5, zoom: 3 });
  });
});

describe("自动跟随：与手动运镜共存", () => {
  test("记录已有起点 → 终点运镜时，终点跟着平移并同样夹进背景", () => {
    const camera: RecordCamera = {
      centerX: 960,
      centerY: 540,
      zoom: 2,
      to: { centerX: 1160, centerY: 540, zoom: 2.5 },
      easing: "easeOut",
      moveFrames: 12,
    };
    const outcome = autoFollowSpeaker({
      record: makeRecord({ chars: [makeSpeaker({ adjX: 500 })], camera }),
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 400 })], camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });

    expect(outcome.applied).toBe(true);
    // 起点被夹到画布右边缘（960 + 480），终点跟着平移 +480 后同样夹到自己的右边缘 1536
    expect(outcome.record.camera).toEqual({
      centerX: 1440,
      centerY: 540,
      zoom: 2,
      to: { centerX: 1536, centerY: 540, zoom: 2.5 },
      easing: "easeOut",
      moveFrames: 12,
    });
  });

  test("说话人就在画面里 → 不产生新的记录对象", () => {
    const camera: RecordCamera = { centerX: 1660, centerY: 540, zoom: 2 };
    const record = makeRecord({ chars: [makeSpeaker({ adjX: 500 })], camera });
    // 说话人居中（脸中心 1551.5 落在取景框 1180~2140 里）→ 不触发
    const outcome = autoFollowSpeaker({
      record,
      previous: makeRecord({ chars: [makeSpeaker({ adjX: 400 })], camera }),
      enabled: true,
      sizeOf: PORTRAIT_SIZES,
    });
    expect(outcome.reason).toBe("in-view");
    expect(outcome.record).toBe(record);
  });
});
