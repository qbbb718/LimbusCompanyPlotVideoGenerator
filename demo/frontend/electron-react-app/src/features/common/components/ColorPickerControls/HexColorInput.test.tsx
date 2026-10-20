import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import HexColorInput from "./HexColorInput";

/**
 * 十六进制颜色输入框：
 * - 6 位写法凑齐就生效（方便边输边看预览）；
 * - 3 位简写只在回车 / 失焦时生效，避免把「FF0」提前变成「#FF0000」；
 * - 中间状态标红且不提交，失焦后回退到当前生效的颜色；
 * - 外部颜色变化（色板 / 吸管）时丢弃输入草稿。
 */
describe("十六进制颜色输入框", () => {
  const setup = (initial = "#FBDBB3") => {
    const onCommit = jest.fn();
    const Wrapper = () => {
      const [value, setValue] = useState(initial);
      return (
        <HexColorInput
          value={value}
          ariaLabel="测试颜色"
          onCommit={(color) => {
            onCommit(color);
            setValue(color);
          }}
        />
      );
    };
    const view = render(<Wrapper />);
    const input = screen.getByLabelText("测试颜色") as HTMLInputElement;
    return { ...view, input, onCommit };
  };

  test("默认显示当前颜色（统一大写）", () => {
    const { input } = setup("#ff8800");
    expect(input.value).toBe("#FF8800");
  });

  test("输入完整的 6 位编码立即生效", () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: "12ab34" } });

    expect(onCommit).toHaveBeenLastCalledWith("#12AB34");
    expect(input.value).toBe("#12AB34");
    expect(input.className).not.toContain("is-invalid");
  });

  test("3 位简写在失焦时才生效", () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: "#F80" } });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("#F80");

    fireEvent.blur(input);

    expect(onCommit).toHaveBeenLastCalledWith("#FF8800");
    expect(input.value).toBe("#FF8800");
  });

  test("回车提交合法的 3 位简写，并且只提交一次", () => {
    const { input, onCommit } = setup();

    input.focus();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("#AABBCC");
  });

  test("中间状态标红、不提交，失焦后回退", () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: "#FF" } });
    expect(input.className).toContain("is-invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("#FBDBB3");
    expect(input.className).not.toContain("is-invalid");
  });

  test("超长的 8 位颜色不会被接受（输入框不接受带透明度的写法）", () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: "#FF8800AA" } });
    expect(input.className).toContain("is-invalid");

    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("#FBDBB3");
  });

  test("Esc 放弃草稿并回退（合法简写也不会被失焦提交）", () => {
    const { input, onCommit } = setup();

    input.focus();
    fireEvent.change(input, { target: { value: "#F80" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("#FBDBB3");
    expect(input.className).not.toContain("is-invalid");
  });

  test("外部颜色变化时丢弃输入草稿", () => {
    const onCommit = jest.fn();
    const { rerender } = render(
      <HexColorInput value="#112233" onCommit={onCommit} ariaLabel="测试颜色" />,
    );
    const input = screen.getByLabelText("测试颜色") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "#4455" } });
    expect(input.value).toBe("#4455");

    rerender(
      <HexColorInput value="#AABBCC" onCommit={onCommit} ariaLabel="测试颜色" />,
    );

    expect(input.value).toBe("#AABBCC");
    expect(input.className).not.toContain("is-invalid");
  });
});
