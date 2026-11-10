import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Portrait } from "@types";
import PortraitSettings from "./PortraitSettings";

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

/**
 * 头部裁剪示例图必须跟着**前端**一起打包。
 *
 * <p>历史实现拼的是 `${BASE_URL}/assets/guides/head-crop-guideline.png`，
 * 而数据目录里从来没有过这个文件（安装包也不带），界面上一直是裂图。
 * 现在改成 `import` 打包资源：Jest 里是文件名，打包后是 static/media 下的文件。
 */
describe("头部裁剪示例图", () => {
  test("走打包资源，不再拼后端 /assets/guides 地址", () => {
    renderSettings(createPortrait());

    const image = screen.getByAltText("头部裁剪区域示例") as HTMLImageElement;
    expect(image.getAttribute("src")).toMatch(/head-crop-guideline\.png$/);
    expect(image.getAttribute("src")).not.toContain("/assets/guides");
    expect(image.className).toBe("crop-hint-image");
  });
});
