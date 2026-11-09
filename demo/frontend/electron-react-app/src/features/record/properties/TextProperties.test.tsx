/**
 * 「剧情编辑 → 文本 → 对话内容」支持换行的 UI 约定：
 * - 输入框是 textarea，换行原样写回记录（不 trim、不转空格）；
 * - 下方提示会显示行数 / 字数，方便确认换行确实生效；
 * - 预览图与成片由后端按换行分段排版（渲染侧见 TextLineBreaker 的 Java 测试）。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DialogueAlign, Emotion, Record as PlotRecord } from "@types";
import ApiService from "@services/ApiService";
import TextProperties from "./TextProperties";

const getCharacters = jest.spyOn(ApiService, "getCharacters");

const makeRecord = (text: string): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text,
    location: "default",
    speakerC: [],
    speakerName: "旁白",
    faction: "中立",
    align: DialogueAlign.CENTER,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

/**
 * 渲染面板并等角色列表的异步请求落地。
 *
 * <p>TextProperties 挂载后会 `ApiService.getCharacters()` 再 setState，用 act 包住渲染
 * 才不会在用例里冒出 "not wrapped in act(...)" 的告警。
 */
const renderPanel = async (record: PlotRecord, updateRecord = jest.fn()) => {
  await act(async () => {
    render(
      <TextProperties
        selectedRecord={record}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );
  });
  return updateRecord;
};

/** 对话内容输入框（面板里唯一的 textarea） */
const dialogueInput = () =>
  screen.getByLabelText("对话内容", { selector: "textarea" });

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getCharacters.mockResolvedValue([]);
});

describe("TextProperties 对话内容支持换行", () => {
  it("多行台词完整显示在 textarea 里（换行不被压平）", async () => {
    await renderPanel(makeRecord("第一行\n第二行"));
    expect(dialogueInput()).toHaveValue("第一行\n第二行");
  });

  it("回车输入的换行原样写回记录", async () => {
    const updateRecord = await renderPanel(makeRecord("第一行"));

    fireEvent.change(dialogueInput(), {
      target: { value: "第一行\n第二行" },
    });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [index, updated] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updated.dialogue.text).toBe("第一行\n第二行");
  });

  it("提示里显示行数与字数（换行不算字）", async () => {
    await renderPanel(makeRecord("第一行\n第二行"));
    expect(screen.getByText(/支持换行/)).toBeInTheDocument();
    expect(screen.getByText(/共 2 行 \/ 6 字/)).toBeInTheDocument();
  });

  it("空台词不显示行数统计", async () => {
    await renderPanel(makeRecord(""));
    expect(screen.getByText(/支持换行/)).toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 行/)).toBeNull();
  });
});
