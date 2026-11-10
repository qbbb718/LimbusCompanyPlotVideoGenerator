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
import { askChoice, askConfirm, ConfirmDialogHost } from "./ConfirmDialog";

/** 打开确认框并拿到它的 Promise（不 await：等用户点按钮才结算） */
const openConfirm = (options: Parameters<typeof askConfirm>[0]) => {
  // 打开确认框本身就会 setState，包在 act 里才不会报 act 警告
  let promise = Promise.resolve(false);
  act(() => {
    promise = askConfirm(options);
  });
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

    // Esc 落在 document 上（捕获阶段），fireEvent 自带 act，不用再包一层
    fireEvent.keyDown(document.body, { key: "Escape" });

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

/**
 * 三选一（保存并新建 / 不保存 / 取消）：新建工程问"是否保存当前工程"用的就是它。
 *
 * <p>二选一放不下"第三种意思"，而"不保存就直接清空"必须留下取消的口子，
 * 所以这里单独钉住三种结果与按钮顺序。
 */
describe("ConfirmDialog（三选一：askChoice）", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  const openChoice = (options: Parameters<typeof askChoice>[0]) => {
    // 打开确认框本身就会 setState（挂 Host 后），包在 act 里才不会报 act 警告
    let promise = Promise.resolve<"confirm" | "extra" | "cancel">("cancel");
    act(() => {
      promise = askChoice(options);
    });
    promise.catch(() => undefined);
    return { promise };
  };

  const choiceOptions = {
    title: "新建工程",
    message: "是否保存当前工程？",
    extraLabel: "不保存",
    confirmLabel: "保存并新建",
    cancelLabel: "取消",
  };

  test("三个按钮都在，顺序是 取消 → 不保存 → 保存并新建", async () => {
    render(<ConfirmDialogHost />);
    openChoice(choiceOptions);

    await screen.findByRole("dialog", { name: "新建工程" });
    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["取消", "不保存", "保存并新建"]);
  });

  test("「保存并新建」→ resolve \"confirm\"；「不保存」→ resolve \"extra\"", async () => {
    render(<ConfirmDialogHost />);

    const first = openChoice(choiceOptions);
    fireEvent.click(await screen.findByRole("button", { name: "保存并新建" }));
    await expect(first.promise).resolves.toBe("confirm");

    const second = openChoice(choiceOptions);
    fireEvent.click(await screen.findByRole("button", { name: "不保存" }));
    await expect(second.promise).resolves.toBe("extra");

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test("Esc / 点遮罩都是取消（不会误触发保存或清空）", async () => {
    render(<ConfirmDialogHost />);

    const byEsc = openChoice(choiceOptions);
    await screen.findByRole("dialog", { name: "新建工程" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    await expect(byEsc.promise).resolves.toBe("cancel");

    const byOverlay = openChoice(choiceOptions);
    await screen.findByRole("dialog", { name: "新建工程" });
    fireEvent.click(screen.getByTestId("app-confirm-overlay"));
    await expect(byOverlay.promise).resolves.toBe("cancel");
  });

  test("回车 = 「保存并新建」（焦点默认在主按钮上）", async () => {
    render(<ConfirmDialogHost />);
    const { promise } = openChoice(choiceOptions);
    await screen.findByRole("dialog", { name: "新建工程" });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "保存并新建" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(document.body, { key: "Enter" });

    await expect(promise).resolves.toBe("confirm");
  });
});
