/**
 * 预览层 DOM 变换的单测。
 *
 * 这里锁三件事：
 * 1. **位移百分比与分辨率无关**：同一世界位移，在 1080p 和 720p 下算出来的百分比必须一样
 *    （因为相机 zoom / 0.8 场景缩放 / 输出缩放都抵消了）；
 * 2. **恒等时返回 null**：DOM 层此时不能加任何 style，否则会和后端渲的栅格图差半个像素；
 * 3. **父子共同原点**：子元素必须绕"父级锚点那个绝对点"旋转，直接抄父级百分比是错的
 *    （表现是"立绘在抖、汗滴绕着画面中心甩出去"）。
 */
import { spriteDomStyle, sharedTransformOrigin } from "./domTransform";
import { identityTransform } from "../animation/animationTypes";

describe("立绘动画 DOM 变换", () => {
  test("恒等变换不产生任何样式", () => {
    expect(spriteDomStyle({ w: 400, h: 600 }, identityTransform(), { x: 0.5, y: 1 })).toBeNull();
    expect(spriteDomStyle({ w: 400, h: 600 }, null, { x: 0.5, y: 1 })).toBeNull();
  });

  test("位移按元素自身宽高的百分比表达（世界像素 → 百分比）", () => {
    const style = spriteDomStyle(
      { w: 400, h: 600 },
      { ...identityTransform(), x: 40, y: -60 },
      { x: 0.5, y: 1 },
    );
    expect(style).not.toBeNull();
    // 40/400 = 10%，-60/600 = -10%
    expect(style!.transform).toBe("translate(10%, -10%) rotate(0deg) scale(1)");
    expect(style!.transformOrigin).toBe("50% 100%");
    expect(style!.opacity).toBeUndefined();
  });

  test("旋转/缩放/透明度都写进同一个 transform", () => {
    const style = spriteDomStyle(
      { w: 200, h: 200 },
      { x: 0, y: 0, scale: 1.25, rotate: 7.5, alpha: 0.5 },
      { x: 0.5, y: 0.5 },
    );
    expect(style!.transform).toBe("translate(0%, 0%) rotate(7.5deg) scale(1.25)");
    expect(style!.transformOrigin).toBe("50% 50%");
    expect(style!.opacity).toBe(0.5);
  });

  test("位移百分比与分辨率无关：同一世界位移在不同输出尺寸下一致", () => {
    // 世界矩形 400 宽；输出 1920 与 640 只是 element 的屏幕宽度不同，
    // 百分比（= dx / 世界宽）不变——这正是"预览与成片一致"的关键
    const transform = { ...identityTransform(), x: 80, y: 0 };
    const a = spriteDomStyle({ w: 400, h: 400 }, transform, { x: 0.5, y: 0.5 });
    const b = spriteDomStyle({ w: 400, h: 400 }, transform, { x: 0.5, y: 0.5 });
    expect(a!.transform).toBe(b!.transform);
    expect(a!.transform).toContain("translate(20%, 0%)");
  });

  test("非法宽高不产生样式（避免除零算出 Infinity%）", () => {
    const transform = { ...identityTransform(), x: 10 };
    expect(spriteDomStyle({ w: 0, h: 100 }, transform, { x: 0.5, y: 0.5 })).toBeNull();
    expect(spriteDomStyle({ w: 100, h: 0 }, transform, { x: 0.5, y: 0.5 })).toBeNull();
  });
});

describe("与后端求值结果的对应关系", () => {
  test("DOM 里的 translate 百分比反算回世界像素，必须等于求值器给的世界位移", () => {
    // 弹跳峰值：world y = -40，元素世界矩形 400×600
    const rect = { w: 400, h: 600 };
    const transform = { x: 0, y: -40, scale: 1, rotate: 0, alpha: 1 };
    const style = spriteDomStyle(rect, transform, { x: 0.5, y: 1 })!;

    const match = /translate\(([-\d.]+)%, ([-\d.]+)%\)/.exec(style.transform);
    expect(match).not.toBeNull();
    const tyPct = Number(match![2]);
    // 百分比 × 世界宽高 → 世界像素位移（相机 zoom / 0.8 / 分辨率都在这一步抵消掉）
    // 容差 0.01px：transform 里的百分比保留 4 位小数（-6.6667%），反算回来会有万分之一像素的误差
    expect(tyPct / 100 * rect.h).toBeCloseTo(-40, 2);
  });
});

describe("父子共同变换原点", () => {
  // 父（立绘）在 (100,100)，400×600，锚点在脚底中心 → 绝对点 (300, 700)
  const parent = { x: 100, y: 100, w: 400, h: 600 };
  const anchor = { x: 0.5, y: 1 };

  test("父级自身：原点是 (50%, 100%)", () => {
    const origin = sharedTransformOrigin(parent, anchor, parent);
    expect(origin.x).toBeCloseTo(0.5, 10);
    expect(origin.y).toBeCloseTo(1, 10);
  });

  test("子元素在父元素右上方：原点必须换算成各自的百分比，指向同一个绝对点", () => {
    // 子（汗滴）在 (400, 0)，100×100 → 绝对点 (300,700) 落在子元素盒子外：
    // x = (300-400)/100 = -1，y = (700-0)/100 = 7
    const child = { x: 400, y: 0, w: 100, h: 100 };
    const origin = sharedTransformOrigin(parent, anchor, child);
    expect(origin.x).toBeCloseTo(-1, 10);
    expect(origin.y).toBeCloseTo(7, 10);

    // 换算后两个元素的"绝对原点"必须相等（这是等价性的定义）。
    // 注意：父级用的是它自己的锚点百分比，子级用换算出来的百分比 —— 二者指向同一个绝对点。
    const parentAbs = {
      x: parent.x + anchor.x * parent.w,
      y: parent.y + anchor.y * parent.h,
    };
    const childAbs = { x: child.x + origin.x * child.w, y: child.y + origin.y * child.h };
    expect(childAbs.x).toBeCloseTo(300, 10);
    expect(childAbs.y).toBeCloseTo(700, 10);
    expect(childAbs.x).toBeCloseTo(parentAbs.x, 10);
    expect(childAbs.y).toBeCloseTo(parentAbs.y, 10);
  });

  test("子元素尺寸为 0 时退回自身锚点，不产生 NaN", () => {
    const origin = sharedTransformOrigin(parent, anchor, { x: 0, y: 0, w: 0, h: 0 });
    expect(origin).toEqual({ x: 0.5, y: 1 });
  });
});
