import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  CharacterVisual,
  DialogueAlign,
  Emotion,
  MyCharacter,
  Portrait,
  Record as PlotRecord,
  TempImageVisual,
} from "@types";
import ApiService from "@services/ApiService";
import CharactersProperties from "./CharactersProperties";

/**
 * "剧情编辑 → 立绘"页签：
 * - 立绘的缩放 / 复原 / X / Y 坐标控件行为不变；
 * - 临时图片（路人 / 道具）已拆成同级的「临时图片」页签，
 *   这里不应再出现它的标题、缩略图或"添加临时图片"入口。
 */

const getCharacters = jest.spyOn(ApiService, "getCharacters");

const makeRecord = (
  chars: CharacterVisual[] = [],
  tempImages: TempImageVisual[] = [],
): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text: "",
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars,
  tempImages,
  effects: [],
  audioCommands: [],
});

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getCharacters.mockResolvedValue([]);
});

const renderPanel = (record: PlotRecord, updateRecord = jest.fn()) => {
  render(
    <CharactersProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

const makeCharacter = (
  overrides: Partial<CharacterVisual> = {},
): CharacterVisual => ({
  chara: {
    characterID: "c1",
    characterName: "测试角色",
    height: 171,
    faction: "未设定",
    colorBg: "#FFFFFF",
    colorText: "#000000",
  },
  portrait: {
    portraitID: "p1",
    characterID: "c1",
    imagePath: "",
    portName: "默认立绘",
    emotion: Emotion.NORMAL,
    faceX: 0,
    faceY: 0,
    length: 183,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
  },
  posX: 960,
  posY: 0,
  adjX: 0,
  adjY: 0,
  scale: 1,
  dim: false,
  ...overrides,
});

describe("CharactersProperties 立绘缩放与复原", () => {
  it("每条立绘都渲染缩放数值框 / 滑块与复原按钮", () => {
    renderPanel(makeRecord([makeCharacter()]));

    expect(screen.getByLabelText("立绘 1 缩放")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 缩放滑块")).toBeTruthy();
    expect(screen.getByTitle(/复原/)).toBeTruthy();
    // 既有的 X / Y 坐标控件仍在
    expect(screen.getByLabelText("立绘 1 X 坐标")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 Y 坐标")).toBeTruthy();
  });

  it("拖动缩放滑块把 scale 写回记录", async () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 缩放滑块"), {
      target: { value: "1.5" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.chars[0].scale).toBe(1.5);
  });

  it("缩放数值框支持小数（不会因为输入中间态被改成整数）", () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 缩放"), {
      target: { value: "2.5" },
    });

    expect(updateRecord.mock.calls[0][1].chars[0].scale).toBe(2.5);
  });

  it("复原只把缩放恢复为 1.0，保留用户调好的 X/Y 偏移", async () => {
    const updateRecord = renderPanel(
      makeRecord([makeCharacter({ scale: 2, adjX: 40, adjY: -30 })]),
    );

    fireEvent.click(screen.getByTitle(/复原/));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.chars[0].scale).toBe(1);
    expect(updatedRecord.chars[0].adjX).toBe(40);
    expect(updatedRecord.chars[0].adjY).toBe(-30);
  });

  it("立绘 X 坐标支持直接输入负数", () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 X 坐标"), {
      target: { value: "-300" },
    });

    // 默认坐标系与设计画布相同，写回值就是 -300
    expect(updateRecord.mock.calls[0][1].chars[0].adjX).toBe(-300);
  });
});

describe("CharactersProperties 不再包含临时图片", () => {
  it("记录里有临时图片时，立绘页签也不渲染任何相关入口", () => {
    // 有立绘、也有临时图片：立绘页签只应管立绘
    renderPanel(
      makeRecord([makeCharacter()], [
        {
          uuid: "t1",
          imagePath: "./projects/temp/images/a.png",
          posX: 0,
          posY: 0,
          scale: 1,
          dim: false,
        },
      ]),
    );

    expect(screen.queryByText("临时图片（路人/道具）")).toBeNull();
    expect(screen.queryByText("临时图片 1")).toBeNull();
    expect(screen.queryByAltText("临时图片 1")).toBeNull();
    expect(screen.queryByText("添加临时图片")).toBeNull();
    expect(screen.queryByText("压暗")).toBeNull();
  });
});

/* ===================== 「更换立绘」弹窗 ===================== */

const makePortrait = (
  portraitID: string,
  portName: string,
  emotion: Emotion = Emotion.NORMAL,
): Portrait => ({
  portraitID,
  characterID: "c1",
  imagePath: `c1/${portraitID}.png`,
  portName,
  emotion,
  faceX: 0,
  faceY: 0,
  length: 183,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/c1/thumbnails/${portraitID}.png`,
});

const makeMyCharacter = (portraits: Portrait[]): MyCharacter => ({
  characterID: "c1",
  characterName: "测试角色",
  height: 171,
  faction: "未设定",
  colorBg: "#FFFFFF",
  colorText: "#000000",
  tags: [],
  portraits,
});

/**
 * 打开「更换立绘」弹窗：点角色卡片上的立绘缩略图。
 * 角色/立绘是挂载后异步拉回来的，所以用 findByRole 等它出来。
 */
const openPortraitPicker = async () => {
  const trigger = await screen.findByRole("button", {
    name: /更换立绘/,
  });
  fireEvent.click(trigger);
  return screen.getByRole("dialog", { name: /选择立绘/ });
};

describe("CharactersProperties 更换立绘弹窗", () => {
  const portraitA = makePortrait("p1", "立绘-A", Emotion.NORMAL);
  const portraitB = makePortrait("p2", "立绘-B", Emotion.ANGRY);

  it("弹窗必须挂在 body 上，而不是属性面板的 DOM 里", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([portraitA, portraitB])]);
    const { container } = render(
      <CharactersProperties
        selectedRecord={makeRecord([makeCharacter()])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
      />,
    );

    const dialog = await openPortraitPicker();

    // 回归点：停靠面板（.dock-panel-host）自带层叠上下文与 overflow，
    // 弹窗一旦留在面板子树里就会被后画的「剧情记录」面板盖住下半截。
    expect(document.body.contains(dialog)).toBe(true);
    // 而面板的渲染子树里查不到它 —— 说明是 Portal，不在面板的层叠上下文里
    expect(within(container).queryByRole("dialog")).toBeNull();
  });

  it("列出这个角色的全部立绘，当前那张标成选中", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([portraitA, portraitB])]);
    renderPanel(makeRecord([makeCharacter()]));

    await openPortraitPicker();

    expect(screen.getByText("立绘-A")).toBeTruthy();
    expect(screen.getByText("立绘-B")).toBeTruthy();
    expect(
      screen.getByTitle("立绘-A（normal）").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTitle("立绘-B（angry）").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("点一张立绘就把 portrait 写回记录并关掉弹窗", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([portraitA, portraitB])]);
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    await openPortraitPicker();
    fireEvent.click(screen.getByTitle("立绘-B（angry）"));

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.chars[0].portrait.portraitID).toBe("p2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("点遮罩 / 按 Esc 都能关掉弹窗", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([portraitA, portraitB])]);
    renderPanel(makeRecord([makeCharacter()]));

    await openPortraitPicker();
    // 遮罩层没有语义角色，只能按 class 点它
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.click(document.querySelector(".portrait-modal-overlay") as Element);
    expect(screen.queryByRole("dialog")).toBeNull();

    await openPortraitPicker();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("角色一张立绘都没有时给出提示，而不是一个空弹窗", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([])]);
    // 记录里也没有立绘可回退：这才是真正的"没东西可选"
    const noPortrait = {
      ...makeCharacter(),
      portrait: undefined as unknown as Portrait,
    };
    renderPanel(makeRecord([noPortrait]));

    await openPortraitPicker();

    expect(
      screen.getByText("这个角色还没有立绘，可到「资源管理 → 角色」里添加"),
    ).toBeTruthy();
    // 没有可选立绘时不该渲染卡片
    expect(screen.queryByTitle(/（normal）|（angry）/)).toBeNull();
  });

  it("素材库里找不到这个角色时：列出记录当前那张立绘，并说明原因", async () => {
    // 角色被删了 / 角色列表还没回来：记录里仍然有它（内联快照），素材库里没有。
    // 以前这里是一张空网格 —— 看起来就是"弹窗打开没内容"。
    getCharacters.mockResolvedValue([]);
    renderPanel(makeRecord([makeCharacter()]));

    await openPortraitPicker();

    expect(
      screen.getByText(
        /素材库里找不到这个角色（可能已被删除）：下面是这条记录当前使用的立绘/,
      ),
    ).toBeTruthy();
    expect(screen.getByTitle("默认立绘（normal）")).toBeTruthy();
  });

  it("素材库里找不到角色、记录里也没有立绘时给出空态提示", async () => {
    getCharacters.mockResolvedValue([]);
    const noPortrait = {
      ...makeCharacter(),
      portrait: undefined as unknown as Portrait,
    };
    renderPanel(makeRecord([noPortrait]));

    await openPortraitPicker();

    expect(
      screen.getByText(
        "素材库里找不到这个角色（可能已被删除），请先在「角色」里重新选择",
      ),
    ).toBeTruthy();
    expect(screen.queryByTitle(/（normal）|（angry）/)).toBeNull();
  });

  it("角色在素材库里但没有立绘时：仍然列出记录当前那张并说明", async () => {
    getCharacters.mockResolvedValue([makeMyCharacter([])]);
    renderPanel(makeRecord([makeCharacter()]));

    await openPortraitPicker();

    expect(
      screen.getByText("素材库里这个角色还没有立绘：下面是这条记录当前使用的立绘"),
    ).toBeTruthy();
    expect(screen.getByTitle("默认立绘（normal）")).toBeTruthy();
  });
});

describe("CharactersProperties 添加表单挑选初始立绘", () => {
  it("走同一个弹窗挑立绘，选完的值随「确认添加」写进记录", async () => {
    const portraitA = makePortrait("p1", "立绘-A", Emotion.NORMAL);
    const portraitB = makePortrait("p2", "立绘-B", Emotion.ANGRY);
    getCharacters.mockResolvedValue([makeMyCharacter([portraitA, portraitB])]);
    const updateRecord = jest.fn();
    const { container } = render(
      <CharactersProperties
        selectedRecord={makeRecord([])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByText("+ 添加立绘"));

    // 选角色（自定义下拉：先点触发器，再点选项）
    fireEvent.click(await screen.findByRole("button", { name: "角色" }));
    fireEvent.click(screen.getByRole("option", { name: /测试角色/ }));

    // 打开「选择立绘」弹窗（此时默认选中的是默认立绘 p1）
    fireEvent.click(
      screen.getByRole("button", { name: "选择立绘（当前：立绘-A）" }),
    );
    const dialog = screen.getByRole("dialog", { name: /选择立绘/ });
    // 弹窗仍然得挂在 body 上，不能跑进添加表单的 DOM 里
    expect(document.body.contains(dialog)).toBe(true);
    expect(within(container).queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTitle("立绘-B（angry）"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "选择立绘（当前：立绘-B）" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByText("确认添加"));

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.chars).toHaveLength(1);
    expect(updatedRecord.chars[0].portrait.portraitID).toBe("p2");
  });
});
