import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import PropertyTabs from "./PropertyTabs";
import type { PropertyTab } from "./useProjectWorkspace";

/**
 * 属性页签：8 个 tab 一行铺满且等宽（等宽是 CSS 的 flex: 1 1 56px，jsdom 算不出布局，
 * 这里只锁"顺序 / emoji / 名称 / 点击"这些写死在组件里的部分，避免以后加 tab 时漏掉 emoji）。
 */
describe("剧情编辑 → 属性页签", () => {
  const LABELS = [
    "文本",
    "立绘",
    "临时图片",
    "背景",
    "摄像机",
    "特效",
    "音效",
    "全局设置",
  ];
  const EMOJIS = ["📝", "👤", "🧩", "🖼️", "🎥", "✨", "🔊", "⚙️"];
  const KEYS: PropertyTab[] = [
    "text",
    "characters",
    "tempImages",
    "background",
    "camera",
    "effects",
    "audio",
    "global",
  ];

  test("8 个页签顺序不变，每个都带 emoji", () => {
    render(
      <PropertyTabs
        activePropertyTab="text"
        setActivePropertyTab={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(LABELS.length);

    tabs.forEach((tab, index) => {
      expect(tab.textContent).toContain(LABELS[index]);
      expect(
        tab.querySelector(".property-tab-emoji")?.textContent?.trim(),
      ).toBe(EMOJIS[index]);
    });
  });

  test("「临时图片」「摄像机」都是与「立绘」同级的独立页签", () => {
    render(
      <PropertyTabs
        activePropertyTab="characters"
        setActivePropertyTab={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    const charactersTab = tabs.find((tab) => tab.textContent?.includes("立绘"))!;
    const tempImagesTab = tabs.find((tab) =>
      tab.textContent?.includes("临时图片"),
    )!;
    const cameraTab = tabs.find((tab) => tab.textContent?.includes("摄像机"))!;

    // 同一层：三个页签的直接父节点都是 tablist
    expect(charactersTab.parentElement).toBe(tempImagesTab.parentElement);
    expect(charactersTab.parentElement).toBe(cameraTab.parentElement);
    expect(charactersTab.parentElement?.getAttribute("role")).toBe("tablist");
    // 立绘页签里不再挂着"临时图片""摄像机"入口
    expect(charactersTab.textContent).not.toContain("临时图片");
    expect(charactersTab.textContent).not.toContain("摄像机");
    // 摄像机挨着背景/特效排（视觉类元素放一起），不是被塞到最末尾
    expect(tabs.indexOf(cameraTab)).toBe(4);
    expect(tabs.indexOf(cameraTab)).toBe(tabs.indexOf(tabs.find((tab) => tab.textContent?.includes("背景"))!) + 1);
  });

  test("当前 tab 带 active 标记，其余不带", () => {
    render(
      <PropertyTabs
        activePropertyTab="global"
        setActivePropertyTab={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[7].className).toBe("active");
    expect(tabs[7].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].className).toBe("");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
  });

  test("点击页签回调对应的 tab 键", () => {
    const setActivePropertyTab = jest.fn();
    render(
      <PropertyTabs
        activePropertyTab="text"
        setActivePropertyTab={setActivePropertyTab}
      />,
    );

    screen.getAllByRole("tab").forEach((tab, index) => {
      fireEvent.click(tab);
      expect(setActivePropertyTab).toHaveBeenNthCalledWith(
        index + 1,
        KEYS[index],
      );
    });
  });
});
