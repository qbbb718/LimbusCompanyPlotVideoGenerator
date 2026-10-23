/**
 * clip 编辑（UI 层纯逻辑）的单测：新建预设、改参数、关键帧增删改。
 *
 * 这些都是"纯函数 + 不改入参"，因为 React 状态与撤销栈都依赖它们不出副作用；
 * 一旦某个函数原地改了数组，用户就会看到"撤销撤不回"这种灵异现象。
 */
import {
  addKeyframe,
  createKeyframeClip,
  createPresetClip,
  createSpriteAnimation,
  newClipId,
  removeKeyframe,
  sortKeyframes,
  withClipParam,
  withKeyframeMeta,
  withKeyframeValue,
} from "./clipEditing";
import { PRESET_IDS } from "./presetRegistry";
import { PRESET_PARAMS } from "./clipEditing";

describe("新建预设 clip", () => {
  test("每个预设都能建出来，参数取元数据默认值且与通道匹配", () => {
    for (const preset of PRESET_IDS) {
      const clip = createPresetClip(preset);
      expect(clip.kind).toBe("preset");
      expect(clip.preset).toBe(preset);
      expect(clip.durationFrames).toBe(60);
      expect(clip.loop).toBe("once");
      // once + reset 默认给 6 帧淡出，避免播完硬跳
      expect(clip.fadeOutFrames).toBe(6);
      expect(clip.onEnd).toBe("reset");
      for (const meta of PRESET_PARAMS[preset]) {
        expect(clip.params![meta.key]).toBe(meta.default);
      }
    }
  });

  test("id 唯一（撤销栈与 React key 都靠它）", () => {
    const a = newClipId("p");
    const b = newClipId("p");
    expect(a).not.toBe(b);
  });
});

describe("改预设参数", () => {
  test("返回新对象，不改入参", () => {
    const clip = createPresetClip("bounce");
    const next = withClipParam(clip, "amplitude", 80);
    expect(next).not.toBe(clip);
    expect(next.params!.amplitude).toBe(80);
    expect(clip.params!.amplitude).toBe(24);
  });
});

describe("关键帧编辑", () => {
  test("新建的关键帧 clip 帧号递增、缓动已给、通道为 xy", () => {
    const clip = createKeyframeClip(60);
    const keys = clip.keys!;
    expect(keys.map((k) => k.f)).toEqual([0, 30, 60]);
    expect(keys.every((k) => k.ease === "easeInOut")).toBe(true);
    expect(clip.channels).toEqual(["x", "y"]);
  });

  test("改通道值后自动重排帧号并更新 channels", () => {
    const clip = createKeyframeClip(60);
    // 把第 0 帧的帧号改到 100，它应该被排到最后
    const moved = withKeyframeMeta(clip, 0, { f: 100 });
    expect(moved.keys!.map((k) => k.f)).toEqual([30, 60, 100]);

    // 只给 scale 赋值：channels 应当包含 scale
    const withScale = withKeyframeValue(moved, 0, "scale", 1.2);
    expect(withScale.channels).toContain("scale");
  });

  test("value 传 null = 删掉该通道（沿用上一帧）", () => {
    const clip = createKeyframeClip(60);
    const cleared = withKeyframeValue(clip, 1, "y", null);
    expect(cleared.keys![1].v.y).toBeUndefined();
    expect(cleared.keys![1].v.x).toBe(0);
  });

  test("加帧接在最后 +10 帧，删帧至少保留一个", () => {
    const clip = createKeyframeClip(60);
    const added = addKeyframe(clip);
    expect(added.keys!.map((k) => k.f)).toEqual([0, 30, 60, 70]);

    const one = removeKeyframe(removeKeyframe(added, 0), 0);
    const last = removeKeyframe(one, 0); // 只剩一个，删不掉
    expect(last.keys!.length).toBe(1);
  });

  test("sortKeyframes 不改入参", () => {
    const keys = [{ f: 30, v: {} }, { f: 0, v: {} }];
    const sorted = sortKeyframes(keys);
    expect(sorted.map((k) => k.f)).toEqual([0, 30]);
    expect(keys.map((k) => k.f)).toEqual([30, 0]);
  });
});

describe("整套动画装备", () => {
  test("带时间基准与空 clip 列表（后端读到 fps≠30 只告警，不改行为）", () => {
    const anim = createSpriteAnimation();
    expect(anim.timebase).toEqual({ unit: "frame", fps: 30 });
    expect(anim.version).toBe(1);
    expect(anim.clips).toEqual([]);
  });
});
