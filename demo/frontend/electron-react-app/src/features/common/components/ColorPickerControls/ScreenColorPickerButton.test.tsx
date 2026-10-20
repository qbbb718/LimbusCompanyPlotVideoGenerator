import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ScreenColorPickerButton from "./ScreenColorPickerButton";
import { pickScreenColor } from "@features/common/utils/screenColorPicker";

jest.mock("@features/common/utils/screenColorPicker", () => ({
  pickScreenColor: jest.fn(),
}));

const mockedPickScreenColor = pickScreenColor as jest.MockedFunction<
  typeof pickScreenColor
>;

/**
 * 屏幕取色按钮：
 * - 吸到颜色后把颜色交给颜色面板；
 * - 取消（返回 null）时什么都不做；
 * - 失败时弹提示；
 * - 取色期间按钮置灰，防止连点叠出多层遮罩。
 */
describe("屏幕取色按钮", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("取到颜色后回调", async () => {
    mockedPickScreenColor.mockResolvedValue("#12AB34");
    const onPicked = jest.fn();

    render(<ScreenColorPickerButton onPicked={onPicked} />);
    fireEvent.click(screen.getByRole("button", { name: /屏幕取色/ }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledWith("#12AB34"));
  });

  test("取消时不回调", async () => {
    mockedPickScreenColor.mockResolvedValue(null);
    const onPicked = jest.fn();

    render(<ScreenColorPickerButton onPicked={onPicked} />);
    fireEvent.click(screen.getByRole("button", { name: /屏幕取色/ }));

    await waitFor(() => expect(mockedPickScreenColor).toHaveBeenCalled());
    expect(onPicked).not.toHaveBeenCalled();
  });

  test("取色失败时弹出可读的提示", async () => {
    mockedPickScreenColor.mockRejectedValue(
      new Error("屏幕截图失败，请检查系统的屏幕录制权限后重试"),
    );
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const onPicked = jest.fn();

    render(<ScreenColorPickerButton onPicked={onPicked} />);
    fireEvent.click(screen.getByRole("button", { name: /屏幕取色/ }));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "屏幕截图失败，请检查系统的屏幕录制权限后重试",
      ),
    );
    expect(onPicked).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test("取色期间按钮置灰，结束后恢复", async () => {
    let resolvePick: (color: string | null) => void = () => {};
    mockedPickScreenColor.mockImplementation(
      () => new Promise<string | null>((resolve) => (resolvePick = resolve)),
    );

    render(<ScreenColorPickerButton onPicked={jest.fn()} />);
    const button = screen.getByRole("button", { name: /屏幕取色/ });

    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));

    resolvePick("#000000");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });
});
