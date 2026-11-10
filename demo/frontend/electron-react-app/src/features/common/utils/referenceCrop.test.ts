import {
  HEAD_BOX_FRAME_SIDE,
  alignmentFromCrop,
  characterAnchorY,
  clampAlignmentScale,
  cropCenterX,
  defaultAlignment,
  deriveCropFromAlignment,
  designToFrame,
  headAnchorInFrame,
  headBoxInFrame,
  isSixteenByNine,
  portraitRectInFrame,
  screenshotPlacement,
  screenshotRectInFrame,
} from "./referenceCrop";

/**
 * 「按截图反推裁剪框」的几何内核。
 *
 * <p>这里刻意不碰任何 DOM：对齐（立绘 → 截图的缩放 + 平移）是输入，
 * 裁剪参数是输出，全部可以手算核对。
 *
 * <p>最关键的几条：
 * <ul>
 *   <li>头框在成片里恒为 183×0.8、左上角恒在 (960, 108+0.8·anchorY) —— 竖直基准；</li>
 *   <li>只取**缩放**（→ length）和**竖直位置**（→ faceY）：对齐整体左右平移，
 *       反推结果必须一个字都不变（原作里角色的左右站位不可靠）；</li>
 *   <li>faceX 由调用方给的框中心决定（{@code cropCenterX}），只按新 length 重新居中；</li>
 *   <li>正推 / 反推必须互为逆运算（往返无损）；</li>
 *   <li>反推结果必须与后端 {@code CharacterVisual.updatePos()} + 0.8 场景变换逐像素吻合。</li>
 * </ul>
 */

/** 一张常见的立绘原图尺寸 */
const PORTRAIT = { width: 1600, height: 2432 };

describe("按截图反推裁剪框", () => {
  describe("基准点：头框在成片里的位置", () => {
    test("头框边长 = 183 × 0.8 = 146.4", () => {
      expect(HEAD_BOX_FRAME_SIDE).toBeCloseTo(146.4, 6);
    });

    test("默认身高 171：头框左上角在 (960, 108 + 0.8×221)", () => {
      const anchor = headAnchorInFrame(171);
      expect(anchor.x).toBeCloseTo(960, 6);
      expect(anchor.y).toBeCloseTo(108 + 0.8 * 221, 6);
      // 靶框就是锚点起、边长 146.4 的方框
      expect(headBoxInFrame(171)).toEqual({
        left: anchor.x,
        top: anchor.y,
        width: HEAD_BOX_FRAME_SIDE,
        height: HEAD_BOX_FRAME_SIDE,
      });
    });

    test("身高每高 1cm，头框上边缘在成片里高 12×0.8 = 9.6px", () => {
      expect(headAnchorInFrame(171).y - headAnchorInFrame(172).y).toBeCloseTo(
        9.6,
        6,
      );
      expect(characterAnchorY(180)).toBe(221 - 108);
    });

    test("身高缺省 / 非法值都按 171 处理", () => {
      expect(characterAnchorY(undefined)).toBe(221);
      expect(characterAnchorY(0)).toBe(221);
      expect(characterAnchorY(Number.NaN)).toBe(221);
    });

    test("设计画布 → 成片帧：×0.8 再偏移 (192,108)", () => {
      expect(designToFrame(0, 0)).toEqual({ x: 192, y: 108 });
      expect(designToFrame(960, 221)).toEqual({ x: 960, y: 108 + 0.8 * 221 });
    });
  });

  describe("正推 / 反推互为逆运算", () => {
    const cases = [
      { crop: { faceX: 568, faceY: 40, length: 400 }, characterHeight: 171 },
      { crop: { faceX: 243, faceY: 0, length: 192 }, characterHeight: 171 },
      { crop: { faceX: 100, faceY: 700, length: 260 }, characterHeight: 160 },
      { crop: { faceX: 0, faceY: 0, length: 640 }, characterHeight: 185 },
    ];

    test.each(cases)(
      "裁剪 $crop（身高 $characterHeight）往返不变",
      ({ crop, characterHeight }) => {
        const alignment = alignmentFromCrop({ crop, characterHeight });
        expect(alignment).not.toBeNull();

        const result = deriveCropFromAlignment({
          alignment: alignment!,
          portraitSize: PORTRAIT,
          characterHeight,
          // 水平位置不从截图读：带上原裁剪框的中心才能原样回来
          centerX: crop.faceX + crop.length / 2,
        });
        expect(result).not.toBeNull();
        expect(result!.crop).toEqual(crop);
        expect(result!.adjusted).toBe(false);
        expect(result!.warnings).toEqual([]);
      },
    );

    test("反推的对齐与后端 updatePos + 0.8 场景变换逐像素吻合", () => {
      const crop = { faceX: 568, faceY: 40, length: 400 };
      const height = 171;

      // CharacterVisual.updatePos()（用户缩放 = 1，adj = 0）
      const baseScale = 183 / crop.length;
      const posX = 960 + (crop.length / 2) * baseScale - (crop.faceX + crop.length / 2) * baseScale;
      const posY = 221 + (crop.length / 2) * baseScale - (crop.faceY + crop.length / 2) * baseScale;

      // RenderOfImage：场景 ×0.8 + (192,108)
      const expected = {
        scale: baseScale * 0.8,
        x: 192 + posX * 0.8,
        y: 108 + posY * 0.8,
      };

      const actual = alignmentFromCrop({ crop, characterHeight: height })!;
      expect(actual.scale).toBeCloseTo(expected.scale, 9);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    });

    test("头框边长换算是 length = 146.4 / S", () => {
      const crop = { faceX: 568, faceY: 40, length: 400 };
      const alignment = alignmentFromCrop({ crop })!;
      expect(alignment.scale).toBeCloseTo(146.4 / 400, 9);

      // 缩放 2 倍 → length 减半
      const zoomed = deriveCropFromAlignment({
        alignment: { ...alignment, scale: alignment.scale * 2 },
        portraitSize: PORTRAIT,
      })!;
      expect(zoomed.crop.length).toBe(200);
    });
  });

  describe("只取缩放与竖直位置：水平不参与", () => {
    test("把对齐整体左右平移，反推结果完全不变（角色站哪边都行）", () => {
      const crop = { faceX: 300, faceY: 100, length: 200 };
      const alignment = alignmentFromCrop({ crop })!;
      const centerX = crop.faceX + crop.length / 2;

      const left = deriveCropFromAlignment({
        alignment: { ...alignment, x: alignment.x - 400 },
        portraitSize: PORTRAIT,
        centerX,
      })!;
      const right = deriveCropFromAlignment({
        alignment: { ...alignment, x: alignment.x + 400 },
        portraitSize: PORTRAIT,
        centerX,
      })!;

      expect(left.crop).toEqual(crop);
      expect(right.crop).toEqual(crop);
    });

    test("faceX 由 centerX 决定：faceX = centerX − length/2", () => {
      const alignment = alignmentFromCrop({ crop: { faceX: 300, faceY: 100, length: 200 } })!;
      const result = deriveCropFromAlignment({
        alignment: { ...alignment, scale: alignment.scale * 2 }, // length 减半 → 100
        portraitSize: PORTRAIT,
        centerX: 800,
      })!;

      expect(result.crop.length).toBe(100);
      expect(result.crop.faceX).toBe(750);
    });

    test("不给 centerX 时退化为立绘图片的水平中心", () => {
      const alignment = alignmentFromCrop({ crop: { faceX: 300, faceY: 100, length: 200 } })!;
      const result = deriveCropFromAlignment({ alignment, portraitSize: PORTRAIT })!;
      expect(result.crop.faceX).toBe(PORTRAIT.width / 2 - result.crop.length / 2);
    });

    test("cropCenterX：有裁剪时取框中心，没有裁剪时为 null", () => {
      expect(cropCenterX({ faceX: 300, faceY: 100, length: 200 })).toBe(400);
      expect(cropCenterX({ faceX: 0, faceY: 0, length: 0 })).toBeNull();
      expect(cropCenterX(null)).toBeNull();
    });
  });

  describe("adjY", () => {
    test("adjY 只影响 faceY", () => {
      const alignment = alignmentFromCrop({ crop: { faceX: 300, faceY: 100, length: 200 } })!;
      const plain = deriveCropFromAlignment({ alignment, portraitSize: PORTRAIT })!;
      const shifted = deriveCropFromAlignment({
        alignment,
        portraitSize: PORTRAIT,
        adjY: -60,
      })!;

      expect(
        Math.abs(
          shifted.crop.faceY -
            plain.crop.faceY -
            (0.8 * -60) / alignment.scale,
        ),
      ).toBeLessThanOrEqual(1);
      expect(shifted.crop.faceX).toBe(plain.crop.faceX);
    });

    test("正推时 adj 也计入：同一份裁剪，adjX 越大立绘越靠右", () => {
      const crop = { faceX: 300, faceY: 100, length: 200 };
      const plain = alignmentFromCrop({ crop })!;
      const shifted = alignmentFromCrop({ crop, adjX: 120 })!;
      expect(shifted.x - plain.x).toBeCloseTo(0.8 * 120, 6);
    });
  });

  describe("越界与异常输入", () => {
    test("框中心太靠边时夹回边界并给出警告", () => {
      const alignment = alignmentFromCrop({
        crop: { faceX: 100, faceY: 100, length: 400 },
      })!;
      // 中心只给 10px，而框边长 400 → faceX = 10 - 200 < 0，同时把立绘往下推让 faceY 也变负
      const result = deriveCropFromAlignment({
        alignment: { ...alignment, y: alignment.y + 500 },
        portraitSize: { width: 800, height: 1000 },
        centerX: 10,
      })!;

      expect(result.adjusted).toBe(true);
      expect(result.warnings.map((w) => w.code)).toContain("outOfBounds");
      expect(result.raw.faceX).toBeCloseTo(10 - 200, 6);
      expect(result.crop.faceX).toBe(0);
      expect(result.crop.faceY).toBe(0);
    });

    test("头框超过图片短边时会被缩小（并记一条越界警告）", () => {
      const result = deriveCropFromAlignment({
        alignment: { scale: 146.4 / 5000, x: 0, y: 0 },
        portraitSize: { width: 800, height: 600 },
      })!;
      expect(result.crop.length).toBe(600);
      expect(result.adjusted).toBe(true);
    });

    test("框太小 / 太大都给提示", () => {
      const tiny = deriveCropFromAlignment({
        alignment: { scale: 20, x: 0, y: 0 },
        portraitSize: { width: 4000, height: 6000 },
      })!;
      expect(tiny.warnings.map((w) => w.code)).toContain("tooSmall");

      const huge = deriveCropFromAlignment({
        alignment: { scale: 0.001, x: 0, y: 0 },
        portraitSize: { width: 4000, height: 6000 },
      })!;
      expect(huge.warnings.map((w) => w.code)).toContain("tooLarge");
    });

    test("对齐 / 尺寸 / 裁剪参数不可用时返回 null", () => {
      expect(
        deriveCropFromAlignment({
          alignment: { scale: 0, x: 0, y: 0 },
          portraitSize: PORTRAIT,
        }),
      ).toBeNull();
      expect(
        deriveCropFromAlignment({
          alignment: { scale: 1, x: 0, y: 0 },
          portraitSize: { width: 0, height: 0 },
        }),
      ).toBeNull();
      expect(
        deriveCropFromAlignment({
          alignment: { scale: Number.NaN, x: 0, y: 0 },
          portraitSize: PORTRAIT,
        }),
      ).toBeNull();
      expect(alignmentFromCrop({ crop: { faceX: 0, faceY: 0, length: 0 } })).toBeNull();
    });

    test("缩放夹取在合法区间内", () => {
      expect(clampAlignmentScale(0)).toBeCloseTo(146.4 / 8192, 9);
      expect(clampAlignmentScale(1e9)).toBeCloseTo(146.4 / 24, 9);
      const mid = clampAlignmentScale(0.5);
      expect(mid).toBeCloseTo(0.5, 9);
    });
  });

  describe("初始对齐与摆放", () => {
    test("没有裁剪参数时给一个「头在中间、贴顶」的初始值", () => {
      const alignment = defaultAlignment({ portraitSize: PORTRAIT })!;
      const result = deriveCropFromAlignment({ alignment, portraitSize: PORTRAIT })!;
      expect(result.crop.faceY).toBe(0);
      expect(result.crop.faceX).toBeCloseTo((PORTRAIT.width - result.crop.length) / 2, 0);
      expect(result.adjusted).toBe(false);
    });

    test("立绘在帧里的矩形 = 左上角 + 原始尺寸 × 缩放", () => {
      const alignment = { scale: 0.25, x: 100, y: 200 };
      expect(portraitRectInFrame(alignment, PORTRAIT)).toEqual({
        left: 100,
        top: 200,
        width: 400,
        height: 608,
      });
      expect(portraitRectInFrame(null, PORTRAIT)).toBeNull();
      expect(portraitRectInFrame(alignment, null)).toBeNull();
    });

    test("截图按宽度铺满 1920；16:9 时纵向不偏移", () => {
      expect(screenshotPlacement({ width: 2560, height: 1440 })).toEqual({
        scale: 0.75,
        offsetX: 0,
        offsetY: 0,
      });
      expect(screenshotRectInFrame({ width: 1280, height: 720 })).toEqual({
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
      });
      // 16:10 的截图：按宽度铺满后会上下溢出，居中摆放
      const wide = screenshotPlacement({ width: 1920, height: 1200 })!;
      expect(wide.offsetY).toBeCloseTo(-60, 6);
    });

    test("16:9 判定：2560×1440 / 1280×720 通过，16:10 与竖图不通过", () => {
      expect(isSixteenByNine({ width: 1920, height: 1080 })).toBe(true);
      expect(isSixteenByNine({ width: 2560, height: 1440 })).toBe(true);
      expect(isSixteenByNine({ width: 1920, height: 1200 })).toBe(false);
      expect(isSixteenByNine({ width: 1080, height: 1920 })).toBe(false);
      expect(isSixteenByNine(null)).toBe(false);
    });
  });
});
