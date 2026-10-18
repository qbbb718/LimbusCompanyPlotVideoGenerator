import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Portrait } from "@types";
import PortraitSettings from "./PortraitSettings";

// PortraitSettings 只用 BASE_URL 拼裁剪提示图的地址，测试里不需要真的请求后端
jest.mock("@services/ApiService", () => ({
  __esModule: true,
  BASE_URL: "http://localhost:8081",
}));

const CHINESE_EMOTION_LABELS = [
  "正常",
  "开心",
  "悲伤",
  "生气",
  "惊讶",
  "困惑",
  "害羞",
  "受伤",
];

const createPortrait = (overrides: Partial<Portrait> = {}): Portrait => ({
  portraitID: "portrait_1",
  characterID: "char_1",
  imagePath: "char_1/portrait_1.png",
  portName: "罗佳-face_happy_L",
  emotion: "happy" as Portrait["emotion"],
  faceX: 0,
  faceY: 0,
  length: 100,
  adjX: 0,
  adjY: 0,
  thumbnailPath: "",
  ...overrides,
});

const renderSettings = (portrait: Portrait) => {
  const setEditingPortrait = jest.fn();
  render(
    <PortraitSettings
      currentPortrait={portrait}
      setEditingPortrait={setEditingPortrait}
    />,
  );
  return {
    setEditingPortrait,
    select: screen.getByLabelText("情绪") as HTMLSelectElement,
  };
};

/**
 * 资源管理 → 角色 → 立绘 → 情绪：
 * 下拉框里的内容必须是中文关键词，不能再露出 normal / HAPPY 这类枚举值。
 */
describe("立绘情绪下拉框", () => {
  test("选项全部是中文关键词", () => {
    const { select } = renderSettings(createPortrait());

    const labels = Array.from(select.options).map((option) => option.textContent);
    expect(labels).toEqual(CHINESE_EMOTION_LABELS);
    labels.forEach((label) => {
      expect(label).toMatch(/^[\u4e00-\u9fff]+$/);
    });
  });

  test("后端小写 code(happy) 显示为中文关键词「开心」", () => {
    const { select } = renderSettings(createPortrait({ emotion: "happy" as any }));

    expect(select.value).toBe("happy");
    expect(select.selectedOptions[0].textContent).toBe("开心");
  });

  test("历史数据里的大写枚举名(NORMAL) 显示为中文关键词「正常」", () => {
    const { select } = renderSettings(createPortrait({ emotion: "NORMAL" as any }));

    expect(select.value).toBe("normal");
    expect(select.selectedOptions[0].textContent).toBe("正常");
  });

  test("选择中文关键词后写入对应的标准情绪", () => {
    const { select, setEditingPortrait } = renderSettings(createPortrait());

    fireEvent.change(select, { target: { value: "sad" } });

    expect(setEditingPortrait).toHaveBeenCalledTimes(1);
    expect(setEditingPortrait.mock.calls[0][0]).toMatchObject({
      portraitID: "portrait_1",
      portName: "罗佳-face_happy_L",
      emotion: "sad",
    });
  });
});
