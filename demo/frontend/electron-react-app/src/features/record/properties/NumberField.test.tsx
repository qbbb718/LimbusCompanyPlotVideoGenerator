import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import NumberField from "./NumberField";

/**
 * 数字输入框：缩放 / 坐标都靠它。
 * 关键回归点：受控 number input 会把 "-"、"2." 净化掉，导致负数和小数输不进去；
 * 这里改用 text + draft 后，输入中间态必须保留，且只在能解析时回写父组件。
 */
describe("NumberField", () => {
  const renderField = (props: Partial<React.ComponentProps<typeof NumberField>> = {}) => {
    const onChange = jest.fn();
    render(
      <NumberField
        value={1}
        onChange={onChange}
        ariaLabel="数值"
        {...props}
      />,
    );
    return { onChange, input: screen.getByLabelText("数值") as HTMLInputElement };
  };

  it("输入小数时保留中间态：2. → 2.5，不会变成 25", () => {
    const { onChange, input } = renderField();

    fireEvent.change(input, { target: { value: "2." } });
    expect(input.value).toBe("2.");
    expect(onChange).toHaveBeenLastCalledWith(2);

    fireEvent.change(input, { target: { value: "2.5" } });
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  it("可以输入负数坐标（坐标不设上下限）", () => {
    const { onChange, input } = renderField({ value: 0, integer: true, min: undefined, max: undefined });

    fireEvent.change(input, { target: { value: "-" } });
    expect(input.value).toBe("-");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "-1280" } });
    expect(onChange).toHaveBeenLastCalledWith(-1280);
  });

  it("整数模式下四舍五入", () => {
    const { onChange } = renderField({ integer: true });

    fireEvent.change(screen.getByLabelText("数值"), {
      target: { value: "12.6" },
    });
    expect(onChange).toHaveBeenLastCalledWith(13);
  });

  it("超出 min / max 时按范围归一化，失焦后显示归一化后的值", () => {
    const { onChange, input } = renderField({
      value: 1,
      min: 0.1,
      max: 3,
    });

    fireEvent.change(input, { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith(3);
    // 编辑期间保留用户输入的原文
    expect(input.value).toBe("5");

    fireEvent.blur(input);
    expect(input.value).toBe("1");
  });

  it("无法解析的内容不写回，失焦后恢复父组件的值", () => {
    const { onChange, input } = renderField({ value: 1.5 });

    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input.value).toBe("1.5");
  });

  it("回车结束编辑并归一化显示", () => {
    const { onChange, input } = renderField({ value: 1, min: 0.1, max: 3 });

    fireEvent.change(input, { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith(3);

    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("1");
  });
});
