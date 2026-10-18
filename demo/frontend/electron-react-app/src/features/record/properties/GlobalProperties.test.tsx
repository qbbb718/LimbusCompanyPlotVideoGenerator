import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DEFAULT_PROJECT_SETTINGS,
  ProjectSettings,
} from "../../common/types";
import GlobalProperties from "./GlobalProperties";

/**
 * 全局设置 tab 的"文字显示速度（全局）"：
 * - 滑块档位必须与"文本"tab 的"显示速度"一致（1 ~ 6，步长 1）；
 * - 改动要通过 onTextSpeedChange 交给上层，由上层统一覆盖到所有记录；
 * - 用户得能从说明文字里知道"这是全局生效、会覆盖单条设置"。
 */
describe("全局设置 → 文字显示速度（全局）", () => {
  const settings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
  const noop = () => {};

  test("滑块取值为 1~6、步长 1，默认显示 3（与后端默认档位一致）", () => {
    render(<GlobalProperties projectSettings={settings} onChange={noop} />);

    const slider = screen.getByLabelText("文字显示速度（全局）") as HTMLInputElement;
    expect(slider.type).toBe("range");
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("6");
    expect(slider.step).toBe("1");
    expect(slider.value).toBe("3");
  });

  test("拖动滑块调用 onTextSpeedChange（由上层统一应用到所有记录）", () => {
    const onTextSpeedChange = jest.fn();
    render(
      <GlobalProperties
        projectSettings={settings}
        onChange={noop}
        onTextSpeedChange={onTextSpeedChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("文字显示速度（全局）"), {
      target: { value: "5" },
    });

    expect(onTextSpeedChange).toHaveBeenCalledTimes(1);
    expect(onTextSpeedChange).toHaveBeenCalledWith(5);
  });

  test("没有 onTextSpeedChange 时退化为只写设置，不会崩", () => {
    const onChange = jest.fn();
    render(<GlobalProperties projectSettings={settings} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("文字显示速度（全局）"), {
      target: { value: "2" },
    });

    expect(onChange).toHaveBeenCalledWith("textSpeed", 2);
  });

  test("说明文字写清“统一应用到所有文本”", () => {
    render(<GlobalProperties projectSettings={settings} onChange={noop} />);

    expect(
      screen.getByText(/修改后会统一应用到所有文本的显示速度/),
    ).toBeTruthy();
  });

  test("旧设置里没有 textSpeed 时，滑块回退到默认档位", () => {
    const legacy = { ...settings } as ProjectSettings;
    delete legacy.textSpeed;

    render(<GlobalProperties projectSettings={legacy} onChange={noop} />);

    expect(
      (screen.getByLabelText("文字显示速度（全局）") as HTMLInputElement).value,
    ).toBe("3");
  });
});
