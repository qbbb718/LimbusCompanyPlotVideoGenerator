/**
 * DockLayout 组件交互：
 * - 三块面板的页签/内容都在，页签可以切换；
 * - 拖出成独立窗口、停靠回来、关闭窗口（隐藏）；
 * - 面板菜单 / 空状态 / 重置布局；
 * - 停靠过程中面板组件不重新挂载（内部状态保留）；
 * - 布局落 localStorage、重新挂载能恢复；
 * - 拖拽指示器与 Esc 取消。
 */
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import DockLayout from "./DockLayout";
import type { DockPanelDefinition } from "./DockLayout";

const Counter: React.FC<{ label: string }> = ({ label }) => {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span>{label}内容</span>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        {label}点击 {count}
      </button>
    </div>
  );
};

const makePanels = (): DockPanelDefinition[] => [
  {
    id: "preview",
    title: "预览",
    icon: "🖼",
    content: <Counter label="预览" />,
  },
  {
    id: "properties",
    title: "属性",
    icon: "🎛",
    content: <Counter label="属性" />,
  },
  {
    id: "records",
    title: "剧情记录",
    icon: "📋",
    content: <Counter label="剧情" />,
  },
];

const rect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({
    x,
    y,
    left: x,
    top: y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  }) as DOMRect;

let storageKeyCounter = 0;

const renderDock = (options: { preload?: unknown } = {}) => {
  storageKeyCounter += 1;
  const storageKey = `test-dock-layout-${storageKeyCounter}`;
  if (options.preload) {
    localStorage.setItem(storageKey, JSON.stringify(options.preload));
  }
  const onNotice = jest.fn();
  const utils = render(
    <DockLayout
      storageKey={storageKey}
      panels={makePanels()}
      onNotice={onNotice}
    />,
  );
  return { ...utils, storageKey, onNotice };
};

const mergedLayout = {
  version: 1,
  dockRoot: {
    type: "tabs",
    id: "merged",
    panels: ["preview", "properties"],
    activePanel: "preview",
  },
  windows: [],
  maximized: null,
};

beforeEach(() => {
  localStorage.clear();
});

describe("基础结构 / 页签切换", () => {
  test("三块面板都在，默认各自占用一个组", () => {
    const { container } = renderDock();

    expect(screen.getByRole("tab", { name: "预览" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "属性" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "剧情记录" })).toBeInTheDocument();
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(screen.getByText("属性内容")).toBeVisible();
    expect(screen.getByText("剧情内容")).toBeVisible();

    // 默认布局两条分割线
    expect(container.querySelectorAll(".dock-splitter")).toHaveLength(2);
    // 三个页签组
    expect(container.querySelectorAll("[data-dock-node-id]")).toHaveLength(3);
  });

  test("同组页签：点击切换只改显隐，内容不重新挂载", () => {
    const { container } = renderDock({ preload: mergedLayout });

    expect(screen.queryByRole("tab", { name: "剧情记录" })).toBeNull();
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(screen.getByText("属性内容")).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "属性" }));

    expect(screen.getByText("属性内容")).toBeVisible();
    expect(screen.getByText("预览内容")).not.toBeVisible();
    expect(container.querySelectorAll(".dock-splitter")).toHaveLength(0);
  });
});

describe("拖出 / 停靠 / 关闭", () => {
  test("「浮动」按钮把面板变成独立窗口，再点「停靠回主区域」可以回来", () => {
    const { container, onNotice } = renderDock();

    fireEvent.click(
      screen.getByRole("button", { name: "把「预览」拖出成独立窗口" }),
    );

    expect(container.querySelectorAll("[data-dock-window-id]")).toHaveLength(1);
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(onNotice).toHaveBeenCalledWith("「预览」已弹出为独立窗口");

    fireEvent.click(screen.getByRole("button", { name: "停靠回主区域" }));

    expect(container.querySelectorAll("[data-dock-window-id]")).toHaveLength(0);
    expect(screen.getByRole("tab", { name: "预览" })).toBeInTheDocument();
    expect(screen.getByText("预览内容")).toBeVisible();
  });

  test("关闭独立窗口 = 面板隐藏，可从「面板」菜单恢复", () => {
    const { container, onNotice } = renderDock();

    fireEvent.click(
      screen.getByRole("button", { name: "把「预览」拖出成独立窗口" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭独立窗口" }));

    expect(container.querySelectorAll("[data-dock-window-id]")).toHaveLength(0);
    expect(screen.queryByRole("tab", { name: "预览" })).toBeNull();
    expect(onNotice).toHaveBeenCalledWith(
      expect.stringContaining("已关闭独立窗口"),
    );

    // 工具条的「面板」按钮出现隐藏数量角标，菜单里能看到状态
    fireEvent.click(screen.getByRole("button", { name: /^面板/ }));
    const hiddenItem = screen.getByRole("menuitem", { name: /预览/ });
    expect(hiddenItem).toHaveTextContent("已隐藏");
    fireEvent.click(hiddenItem);

    expect(screen.getByRole("tab", { name: "预览" })).toBeInTheDocument();
    expect(screen.getByText("预览内容")).toBeVisible();
  });

  test("拖出/停靠往返后，面板内部状态（计数器）保留", () => {
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: "预览点击 0" }));
    expect(screen.getByRole("button", { name: "预览点击 1" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "把「预览」拖出成独立窗口" }),
    );
    expect(screen.getByRole("button", { name: "预览点击 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "停靠回主区域" }));
    expect(screen.getByRole("button", { name: "预览点击 1" })).toBeInTheDocument();
  });
});

describe("面板菜单 / 空状态 / 重置", () => {
  test("菜单可以隐藏当前面板，角标显示隐藏数量", () => {
    renderDock();

    // 标题栏右侧的「隐藏」把面板收进菜单
    fireEvent.click(screen.getByRole("button", { name: "隐藏「预览」" }));

    expect(screen.queryByRole("tab", { name: "预览" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^面板.*1 个隐藏面板/ }),
    ).toBeInTheDocument();

    // 菜单里能看到状态，点击即恢复
    fireEvent.click(screen.getByRole("button", { name: /^面板/ }));
    const hiddenItem = screen.getByRole("menuitem", { name: /预览/ });
    expect(hiddenItem).toHaveTextContent("已隐藏");
    fireEvent.click(hiddenItem);

    expect(screen.getByRole("tab", { name: "预览" })).toBeInTheDocument();
    expect(screen.getByText("预览内容")).toBeVisible();
  });

  test("主区域全空：显示空状态与恢复入口，恢复后布局回来", () => {
    const { container } = renderDock({
      preload: { version: 1, dockRoot: null, windows: [], maximized: null },
    });

    expect(screen.getByText("主编辑区暂时没有面板")).toBeVisible();
    expect(container.querySelectorAll("[data-dock-node-id]")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "恢复「预览」" }));

    expect(screen.queryByText("主编辑区暂时没有面板")).toBeNull();
    expect(screen.getByRole("tab", { name: "预览" })).toBeInTheDocument();
  });

  test("「重置布局」恢复三块区域的默认布局", () => {
    const { container } = renderDock({
      preload: { version: 1, dockRoot: null, windows: [], maximized: null },
    });

    fireEvent.click(screen.getByRole("button", { name: /重置布局/ }));

    expect(screen.queryByText("主编辑区暂时没有面板")).toBeNull();
    expect(container.querySelectorAll("[data-dock-node-id]")).toHaveLength(3);
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(screen.getByText("属性内容")).toBeVisible();
    expect(screen.getByText("剧情内容")).toBeVisible();
  });
});

describe("持久化", () => {
  test("布局变化会写入 localStorage，重新挂载后恢复（独立窗口还在）", async () => {
    const first = renderDock();

    fireEvent.click(
      screen.getByRole("button", { name: "把「预览」拖出成独立窗口" }),
    );

    await waitFor(() => {
      const raw = localStorage.getItem(first.storageKey);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.windows).toHaveLength(1);
      expect(parsed.windows[0].node.panels).toEqual(["preview"]);
    });

    first.unmount();

    const second = render(
      <DockLayout
        storageKey={first.storageKey}
        panels={makePanels()}
        onNotice={jest.fn()}
      />,
    );

    expect(
      second.container.querySelectorAll("[data-dock-window-id]"),
    ).toHaveLength(1);
    expect(screen.getByText("预览内容")).toBeVisible();
  });
});

describe("拖拽：指示器 / 合并 / Esc 取消", () => {
  const mockRects = (container: HTMLElement) => {
    const surface = container.querySelector(".dock-surface") as HTMLElement;
    surface.getBoundingClientRect = () => rect(0, 0, 1000, 700);

    const set = (nodeId: string, x: number, y: number, width: number, height: number) => {
      const element = container.querySelector(
        `[data-dock-node-id="${nodeId}"]`,
      ) as HTMLElement | null;
      if (!element) throw new Error(`找不到面板组 ${nodeId}`);
      element.getBoundingClientRect = () => rect(x, y, width, height);
    };

    set("dock-preview", 0, 0, 500, 300);
    set("dock-properties", 506, 0, 494, 300);
    set("dock-records", 0, 306, 1000, 394);
  };

  const firePointer = (
    target: Element | Window,
    type: "pointerdown" | "pointermove" | "pointerup",
    clientX: number,
    clientY: number,
    pointerId: number,
    button = 0,
  ) => {
    // jsdom 没有 PointerEvent：用 MouseEvent 带上坐标，再补 pointerId
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button,
    });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    fireEvent(target, event);
  };

  test("拖到另一块中间 → 合并成页签；拖动中有 ghost", () => {
    const { container } = renderDock();
    mockRects(container);

    const previewTab = screen.getByRole("tab", { name: "预览" });
    firePointer(previewTab, "pointerdown", 10, 10, 1);
    firePointer(window, "pointermove", 700, 150, 1);

    expect(container.querySelector(".dock-drag-ghost")).toBeTruthy();
    expect(screen.queryByText("松开 → 独立窗口")).toBeNull();

    firePointer(window, "pointerup", 700, 150, 1);

    expect(container.querySelector(".dock-drag-ghost")).toBeNull();
    // 预览和属性合并到同一组：页签组剩 2 个
    expect(container.querySelectorAll("[data-dock-node-id]")).toHaveLength(2);
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(screen.getByText("属性内容")).not.toBeVisible();
    expect(screen.getByText("剧情内容")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "属性" }));
    expect(screen.getByText("属性内容")).toBeVisible();
  });

  test("拖到停靠区外松手 → 变成独立窗口；拖动中提示「松开 → 独立窗口」", () => {
    const { container, onNotice } = renderDock();
    mockRects(container);

    const previewTab = screen.getByRole("tab", { name: "预览" });
    firePointer(previewTab, "pointerdown", 10, 10, 3);
    firePointer(window, "pointermove", 1600, 900, 3);

    expect(screen.getByText("松开 → 独立窗口")).toBeVisible();

    firePointer(window, "pointerup", 1600, 900, 3);

    expect(container.querySelectorAll("[data-dock-window-id]")).toHaveLength(1);
    // 主区域只剩属性 / 记录两组，预览的内容在浮窗里仍然可见
    expect(container.querySelectorAll(".dock-group")).toHaveLength(2);
    expect(screen.getByText("预览内容")).toBeVisible();
    expect(onNotice).toHaveBeenCalledWith("「预览」已拖出为独立窗口");
  });

  test("Esc 取消拖拽：布局不变、ghost 消失", () => {
    const { container } = renderDock();
    mockRects(container);

    const previewTab = screen.getByRole("tab", { name: "预览" });
    firePointer(previewTab, "pointerdown", 10, 10, 2);
    firePointer(window, "pointermove", 700, 150, 2);
    expect(container.querySelector(".dock-drag-ghost")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.querySelector(".dock-drag-ghost")).toBeNull();
    expect(container.querySelectorAll("[data-dock-node-id]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-dock-window-id]")).toHaveLength(0);
    expect(screen.getByText("预览内容")).toBeVisible();
  });
});
