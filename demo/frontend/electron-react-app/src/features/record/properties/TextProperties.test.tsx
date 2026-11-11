/**
 * 「剧情编辑 → 文本 → 对话内容」支持换行的 UI 约定：
 * - 输入框是 textarea，换行原样写回记录（不 trim、不转空格）；
 * - 下方提示会显示行数 / 字数，方便确认换行确实生效；
 * - 预览图与成片由后端按换行分段排版（渲染侧见 TextLineBreaker 的 Java 测试）。
 *
 * <p>另外锁住「说话人」下拉的检索接线：角色名的匹配、阵营与标签的匹配（`searchKeywords`）
 * 都来自面板传下去的选项，命中后选中要写回完整的角色引用（名字 / 阵营 / 立绘 ID）。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DialogueAlign,
  Emotion,
  MyCharacter,
  Record as PlotRecord,
} from "@types";
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

/* ==================== 说话人下拉的检索 ==================== */

/** 素材库里的角色（说话人下拉的选项来源） */
const makeCharacter = (overrides: Partial<MyCharacter>): MyCharacter =>
  ({
    characterID: "c",
    characterName: "角色",
    height: 171,
    faction: "",
    colorBg: "#000000",
    colorText: "#ffffff",
    tags: [],
    portraits: [],
    ...overrides,
  }) as MyCharacter;

/** 打开说话人下拉 */
const openSpeakerMenu = () => fireEvent.click(screen.getByLabelText("说话人"));
/** 说话人下拉里的检索框（与触发器刻意不同名） */
const speakerSearch = () =>
  screen.getByLabelText("说话人检索") as HTMLInputElement;
/** 在检索框里打字 */
const typeSpeakerSearch = (text: string) =>
  fireEvent.change(speakerSearch(), { target: { value: text } });

describe("TextProperties 说话人下拉支持检索", () => {
  beforeEach(() => {
    getCharacters.mockResolvedValue([
      makeCharacter({
        characterID: "c-rot",
        characterName: "罗佳",
        faction: "LCCB",
        tags: ["主角"],
      }),
      makeCharacter({
        characterID: "c-sin",
        characterName: "辛克莱",
        faction: "N公司",
        tags: ["反派"],
      }),
    ]);
  });

  it("按阵营检索到角色，选中后写回完整引用", async () => {
    const updateRecord = await renderPanel(makeRecord("台词"));
    openSpeakerMenu();
    typeSpeakerSearch("N公司");

    // 名字里没有这三个字，靠阵营命中：罗佳被过滤掉
    expect(screen.queryByRole("option", { name: /罗佳/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /辛克莱/ }));

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [index, updated] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updated.dialogue.speakerName).toBe("辛克莱");
    expect(updated.dialogue.faction).toBe("N公司");
    expect(updated.dialogue.speakerC).toEqual([
      expect.objectContaining({ characterID: "c-sin", characterName: "辛克莱" }),
    ]);
    expect(updated.dialogue.freeText).toBe(false);
  });

  it("按标签检索同样命中", async () => {
    await renderPanel(makeRecord("台词"));
    openSpeakerMenu();
    typeSpeakerSearch("反派");

    expect(screen.getByRole("option", { name: /辛克莱/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /罗佳/ })).toBeNull();
  });

  it("按名字检索时列表里不出现多余的命中说明", async () => {
    await renderPanel(makeRecord("台词"));
    openSpeakerMenu();
    typeSpeakerSearch("罗");

    const rot = screen.getByRole("option", { name: "罗佳" });
    expect(rot.querySelector(".character-select-option-name")?.textContent).toBe("罗佳");
    expect(rot.querySelector(".character-select-option-match")).toBeNull();
  });

  it("角色缺阵营 / 标签（老数据）时不能被检索炸掉", async () => {
    getCharacters.mockResolvedValue([
      makeCharacter({
        characterID: "c-old",
        characterName: "缺字段角色",
        faction: undefined as unknown as string,
        tags: undefined as unknown as string[],
      }),
    ]);
    await renderPanel(makeRecord("台词"));
    openSpeakerMenu();

    // 展开不过滤时照常可见；按名字检索也能命中
    expect(screen.getByRole("option", { name: "缺字段角色" })).toBeTruthy();
    typeSpeakerSearch("缺字段");
    expect(screen.getByRole("option", { name: "缺字段角色" })).toBeTruthy();
  });
});
