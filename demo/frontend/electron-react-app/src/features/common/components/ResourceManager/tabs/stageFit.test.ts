/**
 * 序列帧动画预览的**固定长宽比**（舞台等比适配）测试。
 *
 * 锁三条：
 * 1. 舞台永远是 16:9，缩放容器不改变比例（否则预览图会被拉伸变形）；
 * 2. 舞台永远放得进视口（含四周留白），受限的那一轴贴边、另一轴居中留白；
 * 3. 量不到尺寸时不给舞台（交给 CSS 兜底，避免 1px 的假舞台）。
 */
import { STAGE_GUTTER, fitStage } from "./stageFit";

/** 后端渲预览图用的尺寸（16:9） */
const CONTENT = { width: 1280, height: 720 };
const ASPECT = CONTENT.width / CONTENT.height;

describe("序列帧预览舞台：等比适配", () => {
  test("高视口：由宽度顶住，高度按比例留白", () => {
    const stage = fitStage({ width: 800, height: 900 }, CONTENT, 0)!;
    expect(stage).toEqual({ width: 800, height: 450 });
  });

  test("宽视口：由高度顶住，宽度按比例留白", () => {
    const stage = fitStage({ width: 2000, height: 400 }, CONTENT, 0)!;
    expect(stage.height).toBe(400);
    expect(stage.width).toBe(Math.floor(400 * ASPECT));
  });

  test("留白从两侧扣掉，舞台不会超出视口", () => {
    const viewport = { width: 640, height: 360 };
    const stage = fitStage(viewport, CONTENT)!;
    expect(stage.width).toBeLessThanOrEqual(viewport.width - STAGE_GUTTER * 2);
    expect(stage.height).toBeLessThanOrEqual(viewport.height - STAGE_GUTTER * 2);
  });

  test("任意视口下比例都不变（不拉伸）", () => {
    for (const width of [200, 333, 800, 1280, 1920]) {
      for (const height of [120, 240, 500, 1080]) {
        const stage = fitStage({ width, height }, CONTENT);
        expect(stage).not.toBeNull();
        expect(stage!.width).toBeLessThanOrEqual(width);
        expect(stage!.height).toBeLessThanOrEqual(height);
        // 取整误差最多 1px，比例偏差 < 1%
        expect(Math.abs(stage!.width / stage!.height - ASPECT)).toBeLessThan(0.01);
      }
    }
  });

  test("量不到尺寸 / 太小放不下时不给舞台", () => {
    expect(fitStage({ width: 0, height: 0 }, CONTENT)).toBeNull();
    expect(fitStage({ width: 6, height: 6 }, CONTENT)).toBeNull();
  });
});
