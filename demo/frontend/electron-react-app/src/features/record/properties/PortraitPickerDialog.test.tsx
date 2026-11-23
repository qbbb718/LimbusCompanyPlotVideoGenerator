/**
 * 「选择立绘」弹窗（剧情编辑 → 立绘 → 点缩略图 / 「+ 添加立绘」）的回归测试。
 *
 * <p>用户反馈：角色立绘一多，弹窗**最多只显示 16 张**，没有滚动条，后面的立绘根本选不到。
 * 根因不是数据被截断（后端与组件都拿到了全部立绘），而是**类名撞车**：
 * 这个弹窗和「资源管理 → 角色 → 编辑立绘」的裁剪弹窗以前都叫 `.portrait-modal`，
 * 裁剪弹窗那套样式（CharacterModal.css）的 `overflow: hidden; padding: 0` 在打包后的 CSS 里
 * 排在后面，把选择弹窗的 `overflow-y: auto` 覆盖掉了 —— 网格超出一屏的部分被直接裁掉，
 * 默认 1200×800 窗口下正好剩 4 行 × 4 列 = 16 张。
 *
 * <p>所以这里钉两件事：
 * <ol>
 *   <li>24 张立绘必须全部渲染出来，并写明总张数；</li>
 *   <li>对话框只用自己的 `portrait-picker-*` 类名，不能再和裁剪弹窗共用 `.portrait-modal`。</li>
 * </ol>
 *
 * <p>滚动本身来自 PortraitPickerDialog.css（`.portrait-picker-body { min-height: 0; overflow-y: auto }`），
 * jsdom 不加载外部样式，所以这里用"所有卡片都在独立的滚动容器里、标题栏在滚动区外"
 * 来替代表面上的滚动条断言。
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { Emotion, Portrait } from "@types";
import PortraitPickerDialog from "./PortraitPickerDialog";

const makePortrait = (index: number): Portrait => ({
  portraitID: `p${index}`,
  characterID: "c1",
  imagePath: `c1/p${index}.png`,
  portName: `立绘-${String(index).padStart(2, "0")}`,
  emotion: Emotion.NORMAL,
  faceX: 0,
  faceY: 0,
  length: 183,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `c1/thumbnails/p${index}.png`,
});

/** 24 张 > 16：正好覆盖"以前只显示 16 张"的数量 */
const PORTRAITS = Array.from({ length: 24 }, (_, i) => makePortrait(i + 1));

const renderDialog = (
  portraits: Portrait[] = PORTRAITS,
  selectedPortraitId?: string,
) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  render(
    <PortraitPickerDialog
      title="选择立绘 — 测试角色"
      portraits={portraits}
      selectedPortraitId={selectedPortraitId}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { onSelect, onClose };
};

const dialog = () => screen.getByRole("dialog", { name: "选择立绘 — 测试角色" });

describe("PortraitPickerDialog 立绘数量", () => {
  it("24 张立绘全部渲染（回归：以前最多只显示 16 张）", () => {
    renderDialog();

    // 每张卡片都是带 aria-pressed 的 <button>；关闭按钮没有 aria-pressed，不会被算进来
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(24);
    // 最后一张也在，说明不是被截断成前 16 张
    expect(within(dialog()).getByText("立绘-24")).toBeTruthy();
  });

  it("标题栏写明总张数，滚动时也一直看得见", () => {
    renderDialog();

    expect(within(dialog()).getByText("共 24 张")).toBeTruthy();
  });
});

describe("PortraitPickerDialog 结构", () => {
  it("卡片都在独立的滚动内容区里，标题栏不在滚动区里", () => {
    renderDialog();

    // eslint-disable-next-line testing-library/no-node-access
    const body = dialog().querySelector(".portrait-picker-body");
    expect(body).toBeTruthy();
    // 全部 24 张都在滚动容器内 —— 容器滚得动就都能翻到
    // eslint-disable-next-line testing-library/no-node-access
    expect(body!.querySelectorAll(".portrait-picker-item")).toHaveLength(24);

    // 标题与关闭按钮在 .portrait-picker-header 里，和滚动区是兄弟节点
    // eslint-disable-next-line testing-library/no-node-access
    const header = dialog().querySelector(".portrait-picker-header");
    expect(header).toBeTruthy();
    expect(within(header as HTMLElement).getByText("共 24 张")).toBeTruthy();
    // eslint-disable-next-line testing-library/no-node-access
    expect(header!.querySelector(".portrait-picker-body")).toBeNull();
  });

  it("对话框用自己的类名，不与资源管理裁剪弹窗的 .portrait-modal 撞车", () => {
    renderDialog();

    // 撞名正是这个 bug 的根因：裁剪弹窗的 overflow: hidden 会盖掉这里的滚动
    expect(dialog().classList.contains("portrait-picker")).toBe(true);
    expect(dialog().classList.contains("portrait-modal")).toBe(false);
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector(".portrait-modal")).toBeNull();
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector(".portrait-picker-overlay")).toBeTruthy();
  });
});

describe("PortraitPickerDialog 选中态与空态", () => {
  it("选中态只落在当前那张", () => {
    renderDialog(PORTRAITS, "p7");

    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute("title")).toBe("立绘-07（normal）");
  });

  it("没有可选立绘时给提示，不渲染网格，也不写张数", () => {
    renderDialog([]);

    expect(screen.getByText("这个角色还没有立绘")).toBeTruthy();
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelectorAll(".portrait-picker-item")).toHaveLength(0);
    expect(screen.queryByText(/共 \d+ 张/)).toBeNull();
  });
});
