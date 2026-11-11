/**
 * 情绪动画素材层与工程文件归一化的测试。
 *
 * <p>这一层负责两件"用户看不见但坏了很难查"的事：
 * 1. 素材 → 记录的内联快照（必须深拷贝：改素材不能回溯老工程）；
 * 2. 工程文件里写坏的 `emotionAnim` 不能让编辑器崩（兜底风格与 normalizeCamera 一致）。
 */
import { normalizeRecord } from "../projectFile";
import type { EmotionAnim } from "./animationTypes";
import {
  defaultEmotionPlacement,
  emotionPlacementOf,
  isEmotionAnimUsable,
  isSamePlacement,
} from "./animationTypes";
import {
  ANIMATION_CLIP_MAX_TOTAL_FRAMES,
  assetPlacementOf,
  emotionAnimFromAsset,
  isContentInSync,
  isPlacementInSync,
  isSequenceInSync,
  normalizeFrameHolds,
  syncSequenceFromAsset,
  totalFramesOf,
} from "./animationClipAsset";
import type { AnimationClipDto } from "./animationClipAsset";

const asset = (overrides: Partial<AnimationClipDto> = {}): AnimationClipDto => ({
  id: "flow_abcd1234",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  fps: 30,
  frameCount: 3,
  totalFrames: 6,
  frameHolds: [3, 1, 2],
  createdAt: 1,
  frameBaseUrl: "/assets/animation-clips/flow_abcd1234/frames/",
  coverUrl: "/assets/animation-clips/flow_abcd1234/frames/0001.png",
  framesOnDisk: 3,
  missingFrames: false,
  ...overrides,
});

describe("emotionAnimFromAsset", () => {
  test("时序与画布被深拷贝进记录（之后改素材不影响这条记录）", () => {
    const dto = asset();
    const anim = emotionAnimFromAsset(dto);

    expect(anim.clipId).toBe("flow_abcd1234");
    expect(anim.frameHolds).toEqual([3, 1, 2]);
    expect(anim.canvasWidth).toBe(600);
    // 深拷贝的关键断言：改原素材的数组不该影响记录里的快照
    dto.frameHolds[0] = 99;
    expect(anim.frameHolds).toEqual([3, 1, 2]);
  });

  test("缺省表现参数：播一次、无偏移、不透明", () => {
    const anim = emotionAnimFromAsset(asset());
    expect(anim.loop).toBe("once");
    expect(anim.offsetX).toBe(0);
    expect(anim.offsetY).toBe(0);
    expect(anim.scale).toBe(1);
    expect(anim.opacity).toBe(1);
    expect(anim.posterFrame).toBe(0);
    expect(anim.iterations).toBeNull();
  });
});

describe("素材与记录的时序同步", () => {
  test("一致时为 true；素材不存在 / 长度不同 / 数值不同都为 false", () => {
    const anim = emotionAnimFromAsset(asset());
    expect(isSequenceInSync(anim, asset())).toBe(true);
    expect(isSequenceInSync(anim, undefined)).toBe(false);
    expect(isSequenceInSync(anim, asset({ frameHolds: [3, 1] }))).toBe(false);
    expect(isSequenceInSync(anim, asset({ frameHolds: [3, 1, 5] }))).toBe(false);
    expect(isSequenceInSync(anim, asset({ id: "other" }))).toBe(false);
  });

  test("代表帧摆放不同步时也算 out of sync", () => {
    const anim = emotionAnimFromAsset(asset());
    expect(isSequenceInSync(anim, asset({ poster: { frame: 1, offsetX: 0, offsetY: 0, scale: 1 } }))).toBe(
      false,
    );
    expect(isSequenceInSync(anim, asset({ loop: "loop" as any }))).toBe(false);
  });

  test("同步会用素材当前版本整份覆盖记录（包含代表帧摆放与播放参数）", () => {
    const anim: EmotionAnim = {
      ...emotionAnimFromAsset(asset()),
      offsetX: 0.5,
      offsetY: -0.25,
      scale: 2,
      fadeInFrames: 6,
      posterFrame: 2,
    };
    const fresh = asset({
      frameHolds: [1, 1],
      frameCount: 2,
      canvasWidth: 800,
      loop: "hold" as any,
      fadeInFrames: 3,
      poster: { frame: 1, offsetX: 0.1, offsetY: -0.2, scale: 0.8 },
    });
    const next = syncSequenceFromAsset(anim, fresh);

    expect(next.frameHolds).toEqual([1, 1]);
    expect(next.canvasWidth).toBe(800);
    expect(next.loop).toBe("hold");
    expect(next.fadeInFrames).toBe(3);
    // 编排入口在资源管理，所以同步是"整份覆盖"而不是"只换时序、保留用户手动值"
    expect(next.offsetX).toBeCloseTo(0.1, 6);
    expect(next.offsetY).toBeCloseTo(-0.2, 6);
    expect(next.scale).toBeCloseTo(0.8, 6);
    expect(next.posterFrame).toBe(1);
  });
});

/*
 * 摆放（位置 + 缩放）与"素材模板 / 记录快照"的关系。
 *
 * 剧情编辑页允许按记录微调摆放，于是"与素材同步与否"必须拆成两问：
 *  - 时序/播放参数有没有被改过（→ 要提示「从素材同步」）；
 *  - 摆放有没有被改过（→ 只是"已微调"，属于正常操作，不该报警）。
 */
describe("摆放：素材上的原始值 vs 记录里的快照", () => {
  test("assetPlacementOf 读素材的 poster；没有 poster / 没有素材时回落到缺省摆放", () => {
    expect(assetPlacementOf(asset({ poster: { frame: 1, offsetX: 0.25, offsetY: -0.4, scale: 1.2 } }))).toEqual(
      { offsetX: 0.25, offsetY: -0.4, scale: 1.2 },
    );
    // 素材没有 poster（早期素材 / 手写 clip.json）：原作没摆过，就是居中 + 原始尺寸
    expect(assetPlacementOf(asset({ poster: undefined }))).toEqual(defaultEmotionPlacement());
    // 素材整个不在了：同样回落到缺省值（= 没有摆放信息时渲染端会画的位置）
    expect(assetPlacementOf(undefined)).toEqual(defaultEmotionPlacement());
  });

  test("emotionPlacementOf 对非法值兜底：非数字按 0、非正缩放按 1", () => {
    expect(emotionPlacementOf({ offsetX: Number.NaN, offsetY: undefined, scale: 0 })).toEqual({
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    expect(emotionPlacementOf(null)).toEqual(defaultEmotionPlacement());
  });

  test("isSamePlacement 吃掉浮点尾数，但 0.01 头宽的差别要算改动", () => {
    expect(
      isSamePlacement({ offsetX: 0.3, offsetY: -0.4, scale: 1.2 }, {
        offsetX: 0.30000000000000004,
        offsetY: -0.4,
        scale: 1.2,
      }),
    ).toBe(true);
    expect(
      isSamePlacement({ offsetX: 0.3, offsetY: -0.4, scale: 1.2 }, {
        offsetX: 0.31,
        offsetY: -0.4,
        scale: 1.2,
      }),
    ).toBe(false);
  });

  test("只挪了摆放：isPlacementInSync = false，但 isContentInSync 仍为 true", () => {
    const anim = emotionAnimFromAsset(asset({ poster: { frame: 0, offsetX: 0, offsetY: 0, scale: 1 } }));
    const moved: EmotionAnim = { ...anim, offsetX: 1.5, offsetY: -0.75, scale: 0.4 };

    expect(isPlacementInSync(moved, asset())).toBe(false);
    expect(isContentInSync(moved, asset())).toBe(true);
    // 全量判据（含摆放）仍然是"不同步"——工具/测试用得到
    expect(isSequenceInSync(moved, asset())).toBe(false);
  });

  test("时序被改过：isContentInSync 也要为 false（这才是要弹「从素材同步」的情况）", () => {
    const anim = emotionAnimFromAsset(asset());
    expect(isContentInSync({ ...anim, frameHolds: [1, 1, 1, 1] }, asset())).toBe(false);
    expect(isContentInSync({ ...anim, loop: "loop" }, asset())).toBe(false);
    expect(isContentInSync({ ...anim, posterFrame: 2 }, asset())).toBe(false);
    // 素材缺失时无从比较：两个判据都为 false
    expect(isContentInSync(anim, undefined)).toBe(false);
    expect(isPlacementInSync(anim, undefined)).toBe(false);
  });
});

describe("frameHolds 收敛", () => {
  test("每项至少 1 帧，且总时长卡在上限内", () => {
    expect(normalizeFrameHolds([0, 2, -3])).toEqual([1, 2, 1]);
    const huge = new Array(50).fill(100);
    const capped = normalizeFrameHolds(huge);
    expect(totalFramesOf(capped)).toBeLessThanOrEqual(ANIMATION_CLIP_MAX_TOTAL_FRAMES);
    expect(capped.every((hold) => hold >= 1)).toBe(true);
  });
});

describe("工程文件归一化（写坏的 JSON 不能让编辑器崩）", () => {
  const recordWith = (emotionAnim: any) =>
    normalizeRecord({
      uuid: "r1",
      dialogue: { text: "hi" },
      chars: [{ chara: { characterID: "c1", characterName: "角色", height: 171 }, emotionAnim }],
    });

  test("缺 clipId / 空 frameHolds → 整个字段被丢掉（渲染走原路径）", () => {
    expect(recordWith({ clipId: "", frameHolds: [1] }).chars[0].emotionAnim).toBeUndefined();
    expect(recordWith({ clipId: "x", frameHolds: [] }).chars[0].emotionAnim).toBeUndefined();
    expect(recordWith(null).chars[0].emotionAnim).toBeUndefined();
    expect(recordWith("不是对象").chars[0].emotionAnim).toBeUndefined();
  });

  test("越界与非法值被收敛，不会留下 NaN / 负数", () => {
    const anim = recordWith({
      clipId: "flow_1",
      frameHolds: [0, -5, "abc"],
      canvasWidth: 0,
      canvasHeight: -3,
      loop: "乱写的模式",
      iterations: -2,
      startFrame: -10,
      offsetX: 999999,
      scale: -1,
      fadeInFrames: -4,
      opacity: 5,
      posterFrame: 99,
    }).chars[0].emotionAnim;

    expect(anim).toBeDefined();
    expect(anim!.frameHolds).toEqual([1, 1, 1]);
    expect(anim!.canvasWidth).toBe(1);
    expect(anim!.canvasHeight).toBe(1);
    expect(anim!.loop).toBe("once");
    expect(anim!.iterations).toBeNull();
    expect(anim!.startFrame).toBe(0);
    // 偏移单位是头部长度：手写的天文数字被夹到 ±20 个头宽以内
    expect(anim!.offsetX).toBe(20);
    expect(anim!.scale).toBe(0.01);
    expect(anim!.fadeInFrames).toBe(0);
    expect(anim!.opacity).toBe(1);
    expect(anim!.posterFrame).toBe(2);
  });

  test("合法值原样保留", () => {
    const anim = recordWith({
      clipId: "flow_1",
      name: "花开",
      frameHolds: [3, 1, 2],
      canvasWidth: 600,
      canvasHeight: 400,
      loop: "pingpong",
      iterations: 3,
      startFrame: 12,
      offsetX: 10,
      offsetY: -20,
      scale: 1.5,
      fadeInFrames: 4,
      fadeOutFrames: 6,
      opacity: 0.5,
      posterFrame: 1,
    }).chars[0].emotionAnim;

    expect(anim).toEqual({
      version: 1,
      clipId: "flow_1",
      name: "花开",
      canvasWidth: 600,
      canvasHeight: 400,
      frameHolds: [3, 1, 2],
      loop: "pingpong",
      iterations: 3,
      startFrame: 12,
      offsetX: 10,
      offsetY: -20,
      scale: 1.5,
      fadeInFrames: 4,
      fadeOutFrames: 6,
      opacity: 0.5,
      posterFrame: 1,
    });
    expect(isEmotionAnimUsable(anim)).toBe(true);
  });
});
