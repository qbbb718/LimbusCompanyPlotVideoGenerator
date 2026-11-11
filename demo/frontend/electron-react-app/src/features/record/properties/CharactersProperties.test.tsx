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
import * as libraryModule from "../animation/useAnimationClipLibrary";
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

/* ===================== 角色下拉的检索（名字 / 阵营 / 标签） ===================== */

/**
 * 素材库里的两个角色：名字 / 阵营 / 标签都不一样，用来验证"输入阵营、标签也能找到人"。
 * 立绘卡片的「角色」与「添加新立绘」表单的「角色」共用同一份 `characterOptions`，
 * 所以两处的检索来自同一份数据。
 */
const libraryCharacters = (): MyCharacter[] => [
  {
    characterID: "c-rot",
    characterName: "罗佳",
    height: 171,
    faction: "LCCB",
    colorBg: "#FFFFFF",
    colorText: "#000000",
    tags: ["主角"],
    portraits: [{ ...makePortrait("p-rot", "罗佳-默认"), characterID: "c-rot" }],
  },
  {
    characterID: "c-sin",
    characterName: "辛克莱",
    height: 171,
    faction: "N公司",
    colorBg: "#FFFFFF",
    colorText: "#000000",
    tags: ["反派"],
    portraits: [{ ...makePortrait("p-sin", "辛克莱-默认"), characterID: "c-sin" }],
  },
];

/** 打开「角色」下拉，并等素材库里的角色回来（挂载后才异步拉取） */
const openCharacterMenu = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "角色" }));
  await screen.findByRole("option", { name: /罗佳/ });
};

/** 在下拉的检索框里打字 */
const typeCharacterSearch = (text: string) =>
  fireEvent.change(screen.getByLabelText("角色检索"), {
    target: { value: text },
  });

describe("CharactersProperties 角色下拉支持检索", () => {
  it("立绘卡片的「角色」下拉：按阵营找到人，选中后写回这条立绘的角色", async () => {
    getCharacters.mockResolvedValue(libraryCharacters());
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));
    await openCharacterMenu();

    // 名字里没有"N公司"：命中的是阵营，罗佳被过滤掉
    typeCharacterSearch("N公司");
    expect(screen.queryByRole("option", { name: /罗佳/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /辛克莱/ }));

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [index, updated] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updated.chars[0].chara).toMatchObject({
      characterID: "c-sin",
      characterName: "辛克莱",
      faction: "N公司",
    });
  });

  it("「添加新立绘」表单的「角色」下拉：按标签找到人，并带出他的默认立绘", async () => {
    getCharacters.mockResolvedValue(libraryCharacters());
    renderPanel(makeRecord([]));

    fireEvent.click(screen.getByText("+ 添加立绘"));
    await openCharacterMenu();

    // 名字里没有"反派"：命中的是标签
    typeCharacterSearch("反派");
    expect(screen.queryByRole("option", { name: /罗佳/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /辛克莱/ }));

    // 选完角色自动带出默认立绘（添加表单里的按钮标题跟着变）
    expect(
      screen.getByRole("button", { name: "选择立绘（当前：辛克莱-默认）" }),
    ).toBeTruthy();
  });
});

/* ===================== 序列帧动画（情绪动画）的摆放 ===================== */

describe("CharactersProperties 立绘的序列帧动画摆放", () => {
  /**
   * 素材库里什么都没有：摆放编辑必须**只凭记录里的内联快照**就能工作
   * （素材被删 / 换机器没带素材时正是这种情况）。
   *
   * <p>这个 spy 只在本 describe 里生效并逐个用例还原：文件顶部那个
   * `getCharacters` spy 要靠 `resetMocks` 之后的 `mockResolvedValue` 续命，
   * 不能整份 `restoreAllMocks`。
   */
  let librarySpy: jest.SpyInstance;

  beforeEach(() => {
    librarySpy = jest
      .spyOn(libraryModule, "useAnimationClipLibrary")
      .mockReturnValue({
        clips: [],
        loading: false,
        error: null,
        reload: jest.fn(),
        find: () => undefined,
      });
  });

  afterEach(() => {
    librarySpy.mockRestore();
  });

  const withEmotionAnim = (overrides: Record<string, unknown> = {}) =>
    makeCharacter({
      emotionAnim: {
        version: 1,
        clipId: "flow_1",
        name: "花开",
        canvasWidth: 600,
        canvasHeight: 400,
        frameHolds: [3, 1, 2],
        loop: "once",
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        posterFrame: 0,
        ...overrides,
      },
    });

  it("拖摆放滑杆把位置写回这条记录的 emotionAnim，其余字段原样保留", async () => {
    const updateRecord = renderPanel(makeRecord([withEmotionAnim()]));

    fireEvent.change(screen.getByLabelText("测试角色 动画 Y 位置滑块"), {
      target: { value: "0.75" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.chars[0].emotionAnim.offsetY).toBe(0.75);
    // 动画的时序快照与立绘自己的缩放都不该被这次微调改掉
    expect(updatedRecord.chars[0].emotionAnim.frameHolds).toEqual([3, 1, 2]);
    expect(updatedRecord.chars[0].scale).toBe(1);
  });

  it("微调后点「还原」把摆放收回缺省值（素材已删时没有原摆放可比）", async () => {
    const updateRecord = renderPanel(
      makeRecord([withEmotionAnim({ offsetX: 1.5, offsetY: -0.5, scale: 2 })]),
    );

    fireEvent.click(screen.getByLabelText("测试角色 还原动画摆放"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.chars[0].emotionAnim.offsetX).toBe(0);
    expect(updatedRecord.chars[0].emotionAnim.offsetY).toBe(0);
    expect(updatedRecord.chars[0].emotionAnim.scale).toBe(1);
  });

  it("没挂序列帧动画的立绘不显示摆放控件", () => {
    renderPanel(makeRecord([makeCharacter()]));

    expect(screen.queryByText("摆放（相对头部区域）")).toBeNull();
  });
});

/* ===================== 批量删除 ===================== */

const makeSecondCharacter = (name: string): CharacterVisual =>
  makeCharacter({
    chara: {
      characterID: "c2",
      characterName: name,
      height: 171,
      faction: "未设定",
      colorBg: "#FFFFFF",
      colorText: "#000000",
    },
    portrait: {
      portraitID: "p2",
      characterID: "c2",
      imagePath: "",
      portName: "第二张",
      emotion: Emotion.NORMAL,
      faceX: 0,
      faceY: 0,
      length: 183,
      adjX: 0,
      adjY: 0,
      thumbnailPath: "",
    },
  });

describe("CharactersProperties 批量删除", () => {
  it("勾选两条 → 出现「批量删除」；确认后一次写回记录、清空勾选、通知预览态", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const onVisualsRemoved = jest.fn();
    const updateRecord = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([
          makeCharacter(),
          makeSecondCharacter("第二个角色"),
        ])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
        onVisualsRemoved={onVisualsRemoved}
      />,
    );

    // 没勾选时没有批量删除入口
    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByLabelText("选择立绘 2"));
    expect(screen.getByText("已选 2 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const [recordIndex, updatedRecord] = updateRecord.mock.calls[0];
    expect(recordIndex).toBe(0);
    expect(updatedRecord.chars).toEqual([]);
    expect(onVisualsRemoved).toHaveBeenCalledWith([0, 1]);
    // 勾选清空 → 批量删除入口消失
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull(),
    );
    expect(screen.getByText("已选 0 / 2")).toBeTruthy();
  });

  it("确认框里点取消 → 不写回记录", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    const updateRecord = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([makeCharacter()])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("全选 / 取消全选只动勾选，不动素材本身", () => {
    const updateRecord = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([
          makeCharacter(),
          makeSecondCharacter("第二个角色"),
        ])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选 2 / 2")).toBeTruthy();
    expect(screen.getByText("取消全选")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("取消全选"));
    expect(screen.getByText("已选 0 / 2")).toBeTruthy();
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("单条「删除」也走同一套逻辑：通知预览态并清空勾选", async () => {
    const onVisualsRemoved = jest.fn();
    const updateRecord = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([
          makeCharacter(),
          makeSecondCharacter("第二个角色"),
        ])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
        onVisualsRemoved={onVisualsRemoved}
      />,
    );

    fireEvent.click(screen.getAllByText("删除")[0]);

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord.mock.calls[0][1].chars).toHaveLength(1);
    expect(onVisualsRemoved).toHaveBeenCalledWith([0]);
  });
});

/* ===================== 点卡片 → 预览选中 ===================== */

describe("CharactersProperties 点卡片 → 预览选中", () => {
  it("点卡片本体请求预览选中；不会顺手勾上批量删除的复选框", () => {
    const onSelectVisual = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([makeCharacter()])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByRole("heading", { name: "测试角色" }));

    expect(onSelectVisual).toHaveBeenCalledWith(0);
    expect(
      (screen.getByLabelText("选择立绘 1") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("点卡片里的控件（滑杆 / 勾选框 / 删除按钮）不触发预览选中", () => {
    const onSelectVisual = jest.fn();
    render(
      <CharactersProperties
        selectedRecord={makeRecord([makeCharacter()])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByLabelText("立绘 1 缩放滑块"));
    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getAllByText("删除")[0]);

    expect(onSelectVisual).not.toHaveBeenCalled();
  });

  it("activeIndex 指向的那张卡片显示预览选中态（与批量勾选态分开）", () => {
    const { container } = render(
      <CharactersProperties
        selectedRecord={makeRecord([
          makeCharacter(),
          makeSecondCharacter("第二个角色"),
        ])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        activeIndex={1}
      />,
    );

    const items = container.querySelectorAll(".character-item");
    expect(items[0].getAttribute("data-preview-selected")).toBeNull();
    expect(items[1].getAttribute("data-preview-selected")).toBe("true");
    expect(items[1].className).toContain("visual-card-preview-selected");
  });
});
