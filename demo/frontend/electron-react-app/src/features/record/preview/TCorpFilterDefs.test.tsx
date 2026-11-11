import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import TCorpFilterDefs from "./TCorpFilterDefs";
import { T_CORP_FILTER_ID, T_CORP_FILTER_RGB, T_CORP_FILTER_STEPS } from "./tCorpFilter";

/**
 * SVG 滤镜定义（DOM 场景层染色用的那一份）。
 *
 * <p>这里只验结构：jsdom 不算滤镜像素，但**结构错了整套染色就不生效**（静默失效最难查）——
 * 少了 `color-interpolation-filters="sRGB"` 会让画面明显发亮，少了 feFunc 会让某个通道不调色。
 * 数值对不对由 `tCorpFilter.test.ts` 与后端 `TCorpFilterTest` 各自锁。
 */
describe("TCorpFilterDefs", () => {
  it("关着的时候不渲染任何节点", () => {
    const { container } = render(<TCorpFilterDefs enabled={false} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("开着的时候挂一份 id 正确的 <filter>", () => {
    const { container } = render(<TCorpFilterDefs enabled />);
    const defs = container.querySelector("svg.t-corp-filter-defs");
    expect(defs).toBeTruthy();
    expect(defs?.getAttribute("aria-hidden")).toBe("true");

    const filter = container.querySelector(`#${T_CORP_FILTER_ID}`);
    expect(filter).toBeTruthy();
    expect(filter?.tagName.toLowerCase()).toBe("filter");
  });

  it("必须显式 sRGB：SVG 默认在 linearRGB 里算，画面会明显发亮、与成片对不上", () => {
    const { container } = render(<TCorpFilterDefs enabled />);
    const filter = container.querySelector(`#${T_CORP_FILTER_ID}`);
    expect(filter?.getAttribute("color-interpolation-filters")).toBe("sRGB");
  });

  it("feColorMatrix 用的是 Rec.601 那一行权重（与后端 y = .299R+.587G+.114B 一致）", () => {
    const { container } = render(<TCorpFilterDefs enabled />);
    const matrix = container.querySelector("feColorMatrix");
    expect(matrix).toBeTruthy();
    expect(matrix?.getAttribute("type")).toBe("matrix");

    const numbers = (matrix?.getAttribute("values") ?? "")
      .trim()
      .split(/\s+/)
      .map(Number);
    expect(numbers).toHaveLength(20);
    // 前三行的前三列都应是 0.299 / 0.587 / 0.114
    for (let row = 0; row < 3; row++) {
      expect(numbers[row * 5]).toBeCloseTo(0.299, 6);
      expect(numbers[row * 5 + 1]).toBeCloseTo(0.587, 6);
      expect(numbers[row * 5 + 2]).toBeCloseTo(0.114, 6);
    }
    // alpha 行保持恒等
    expect(numbers[15]).toBe(0);
    expect(numbers[18]).toBe(1);
  });

  it("三个通道各有一张 256 级表，且首尾等于控制点端点", () => {
    const { container } = render(<TCorpFilterDefs enabled />);
    const transfer = container.querySelector("feComponentTransfer");
    expect(transfer).toBeTruthy();

    ["feFuncR", "feFuncG", "feFuncB"].forEach((tag, channel) => {
      const func = transfer?.querySelector(tag);
      expect(func).toBeTruthy();
      expect(func?.getAttribute("type")).toBe("table");

      const values = (func?.getAttribute("tableValues") ?? "").trim().split(/\s+/).map(Number);
      expect(values).toHaveLength(T_CORP_FILTER_STEPS);
      // 首尾与后端 8bit 表对得上（6 位小数，误差 < 1/255）
      expect(values[0]).toBeCloseTo(T_CORP_FILTER_RGB[0][channel] / 255, 3);
      expect(values[T_CORP_FILTER_STEPS - 1]).toBeCloseTo(
        T_CORP_FILTER_RGB[T_CORP_FILTER_RGB.length - 1][channel] / 255,
        3,
      );
    });
  });
});
