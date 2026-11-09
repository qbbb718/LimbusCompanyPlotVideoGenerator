import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ModalPortal from "./ModalPortal";

/**
 * 弹窗外壳的两个约定：
 * 1. **必须挂在 document.body 上** —— 属性面板活在 DockLayout 的停靠面板里
 *    （`.dock-panel-host` 自带层叠上下文 + overflow），弹窗留在面板里会被后画的
 *    「剧情记录」面板盖掉下半截，看起来就是"弹窗没有内容"；
 * 2. 点遮罩 / 按 Esc 关闭，点对话框内部不关闭。
 */
describe("ModalPortal", () => {
  it("内容挂在 body 上，不在渲染位置所在的子树里", () => {
    const { container } = render(
      <div className="dock-panel-host">
        <ModalPortal
          label="测试弹窗"
          onClose={jest.fn()}
          overlayClassName="test-overlay"
          dialogClassName="test-dialog"
        >
          <p>弹窗内容</p>
        </ModalPortal>
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "测试弹窗" });
    expect(document.body.contains(dialog)).toBe(true);
    // 关键回归：渲染位置所在的子树里查不到它 —— 说明确实挂到了 body 上，
    // 否则会被停靠面板的层叠上下文/overflow 裁掉
    expect(within(container).queryByRole("dialog")).toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("弹窗内容")).toBeTruthy();
  });

  it("点遮罩关闭，点对话框内部不关闭", () => {
    const onClose = jest.fn();
    render(
      <ModalPortal
        label="测试弹窗"
        onClose={onClose}
        overlayClassName="test-overlay"
        dialogClassName="test-dialog"
      >
        <p>弹窗内容</p>
      </ModalPortal>,
    );

    fireEvent.click(screen.getByText("弹窗内容"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    // 遮罩层没有语义角色，只能按 class 点它
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.click(document.querySelector(".test-overlay") as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("按 Esc 关闭（且在捕获阶段吞掉，不会漏给页面其它 Esc 处理器）", () => {
    const onClose = jest.fn();
    const pageHandler = jest.fn();
    document.addEventListener("keydown", pageHandler);
    render(
      <ModalPortal
        label="测试弹窗"
        onClose={onClose}
        overlayClassName="test-overlay"
        dialogClassName="test-dialog"
      >
        <p>弹窗内容</p>
      </ModalPortal>,
    );

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    // 页面级的 Esc 监听（预览停止播放、取消面板拖拽…）不应该在弹窗打开时也收到这一次按键
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener("keydown", pageHandler);
  });

  it("其它按键不关闭", () => {
    const onClose = jest.fn();
    render(
      <ModalPortal
        label="测试弹窗"
        onClose={onClose}
        overlayClassName="test-overlay"
        dialogClassName="test-dialog"
      >
        <p>弹窗内容</p>
      </ModalPortal>,
    );

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
