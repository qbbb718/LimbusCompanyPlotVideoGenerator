/**
 * 应用内确认框的行为约定（替代 window.confirm）。
 *
 * <p>背景：Electron 里 `window.confirm` 是原生的 Win32 MessageBox，关掉之后窗口
 * 拿不回键盘焦点 —— 剧情编辑页「对话内容」点不进、打不了字，只能重启。
 * 所以凡是需要确认的地方都必须走 `askConfirm`，**不允许**再调 `window.confirm`。
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { askConfirm, ConfirmDialogHost } from "./ConfirmDialog";

/** 打开确认框并拿到它的 Promise（不 await：等用户点按钮才结算） */
const openConfirm = (options: Parameters<typeof askConfirm>[0]) => {
  const promise = askConfirm(options);
  // 免得 TS 报"Promise 未被使用"：真正断言在各自的测试里 await
  promise.catch(() => undefined);
  return { promise };
};

describe("ConfirmDialog（应用内确认框）", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    // 任何情况下都不该走到原生 confirm
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  const renderHost = () => render(<ConfirmDialogHost />);

  test("确定 → resolve(true)，且不碰 window.confirm", async () => {
    renderHost();
    const { promise } = openConfirm({
      title: "删除角色",
      message: "确定删除角色「格里高尔」吗？",
      detail: "将同时删除数据库记录和磁盘中的角色素材。",
      confirmLabel: "删除",
      danger: true,
    });

    const dialog = await screen.findByRole("dialog", { name: "删除角色" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("确定删除角色「格里高尔」吗？")).toBeInTheDocument();
    expect(
      screen.getByText("将同时删除数据库记录和磁盘中的角色素材。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await expect(promise).resolves.toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("取消 → resolve(false)", async () => {
    renderHost();
    const { promise } = openConfirm({ message: "要解散分组吗？" });
    await screen.findByRole("dialog", { name: "请确认" });

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await expect(promise).resolves.toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("Esc 取消；打开时焦点在确定按钮上", async () => {
    renderHost();
    const { promise } = openConfirm({ message: "要执行吗？" });
    await screen.findByRole("dialog");

    // 焦点默认落在「确定」上：键盘用户直接回车即可
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "确定" })).toHaveFocus(),
    );

    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    await expect(promise).resolves.toBe(false);
  });

  test("点遮罩关闭 = 取消", async () => {
    renderHost();
    const { promise } = openConfirm({ message: "要执行吗？" });
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByTestId("app-confirm-overlay"));

    await expect(promise).resolves.toBe(false);
  });

  test("没挂 Host 时退化成原生 confirm（单测里的兼容行为）", async () => {
    // 不渲染 ConfirmDialogHost
    confirmSpy.mockReturnValue(false);
    await expect(askConfirm({ message: "退化成原生？" })).resolves.toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith("退化成原生？");
  });
});
