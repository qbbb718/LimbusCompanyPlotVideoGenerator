import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ApiService from "@services/ApiService";
import PortraitScenePreview from "./PortraitScenePreview";

jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: {
    getBackgrounds: jest.fn(),
    getPortraitPreview: jest.fn(),
    getCharacters: jest.fn(),
  },
}));

const mockedApi = ApiService as unknown as {
  getBackgrounds: jest.Mock;
  getPortraitPreview: jest.Mock;
  getCharacters: jest.Mock;
};

const BACKGROUNDS = [
  { uuid: "bg-1", name: "办公室", path: "/assets/backgrounds/office.png", tags: [] },
  { uuid: "bg-2", name: "走廊", path: "/assets/backgrounds/hall.png", tags: [] },
];

/** 一张立绘（只写对比功能会用到的字段，其余给默认值） */
const portrait = (
  portraitID: string,
  characterID: string,
  portName: string,
  overrides: Record<string, unknown> = {},
) => ({
  portraitID,
  characterID,
  imagePath: `${characterID}/${portraitID}.png`,
  portName,
  emotion: "NORMAL",
  faceX: 10,
  faceY: 20,
  length: 300,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/${characterID}/thumbnails/${portraitID}.png`,
  ...overrides,
});

const CHARACTER_GRE = {
  characterID: "c_gre",
  characterName: "格雷高尔",
  height: 180,
  portraits: [portrait("p_gre_1", "c_gre", "格雷高尔-常服")],
};

const CHARACTER_ROJ = {
  characterID: "c_roj",
  characterName: "罗佳",
  height: 160,
  portraits: [
    portrait("p_roj_1", "c_roj", "罗佳-常服"),
    portrait("p_roj_2", "c_roj", "罗佳-开心", { emotion: "HAPPY" }),
  ],
};

const CHARACTERS = [CHARACTER_GRE, CHARACTER_ROJ];

/** 打开选择器、选中某个角色、点某张立绘 */
const addComparePortrait = async (
  characterId: string,
  portraitName: string,
) => {
  fireEvent.click(screen.getByRole("button", { name: /添加对比角色/ }));

  if (characterId) {
    const select = (await screen.findByLabelText("对比角色")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: characterId } });
  }

  const name = await screen.findByText(portraitName);
  const card = name.closest("button");
  expect(card).toBeTruthy();
  fireEvent.click(card!);
};

/**
 * 立绘场景预览弹窗：
 * - 打开后自动选第一张背景并请求渲染；
 * - 请求里必须带上当前裁剪参数、角色身高与所选背景；
 * - 切换背景后重新请求；
 * - 没有背景时给出可执行的提示，而不是渲染一张空图；
 * - 可以添加对比角色：按左右偏移一起渲染，能移除，改间距后重新渲染。
 */
describe("立绘场景预览", () => {
  beforeAll(() => {
    // jsdom 没有实现 createObjectURL/revokeObjectURL，这里按真实行为 mock 掉
    (URL as any).createObjectURL = jest.fn(() => "blob:preview");
    (URL as any).revokeObjectURL = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getBackgrounds.mockResolvedValue(BACKGROUNDS);
    mockedApi.getPortraitPreview.mockResolvedValue("blob:preview");
    mockedApi.getCharacters.mockResolvedValue(CHARACTERS);
  });

  const renderPreview = (
    overrides: Partial<React.ComponentProps<typeof PortraitScenePreview>> = {},
  ) =>
    render(
      <PortraitScenePreview
        imagePath="char_1/portrait_1.png"
        faceX={120}
        faceY={30}
        length={180}
        adjX={5}
        adjY={-6}
        characterHeight={170}
        onClose={jest.fn()}
        {...overrides}
      />,
    );

  /** 最近一次预览请求的 FormData */
  const lastFormData = (): FormData =>
    mockedApi.getPortraitPreview.mock.calls[
      mockedApi.getPortraitPreview.mock.calls.length - 1
    ][0] as FormData;

  test("自动使用第一张背景渲染，并携带当前裁剪参数", async () => {
    renderPreview();

    const image = await screen.findByAltText("立绘在画面中的预览效果");
    expect(image.getAttribute("src")).toBe("blob:preview");

    const select = screen.getByLabelText("背景") as HTMLSelectElement;
    expect(select.value).toBe("bg-1");

    expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(1);
    const formData = mockedApi.getPortraitPreview.mock.calls[0][0] as FormData;
    expect(formData.get("imagePath")).toBe("char_1/portrait_1.png");
    expect(formData.get("backgroundId")).toBe("bg-1");
    expect(formData.get("faceX")).toBe("120");
    expect(formData.get("faceY")).toBe("30");
    expect(formData.get("length")).toBe("180");
    expect(formData.get("adjX")).toBe("5");
    expect(formData.get("adjY")).toBe("-6");
    expect(formData.get("height")).toBe("170");
    // 已有立绘不应把文件再传一遍
    expect(formData.has("file")).toBe(false);
    // 没加对比角色时不能带 compare 字段
    expect(formData.getAll("compare")).toEqual([]);
    // 对比角色列表是"打开选择器时才拉"，不该拖慢预览本身
    expect(mockedApi.getCharacters).not.toHaveBeenCalled();
  });

  test("切换背景后重新请求一张预览图", async () => {
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    fireEvent.change(screen.getByLabelText("背景"), {
      target: { value: "bg-2" },
    });

    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2),
    );
    expect(lastFormData().get("backgroundId")).toBe("bg-2");
  });

  test("新立绘（未上传文件）优先上传文件而不是依赖 imagePath", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", {
      type: "image/png",
    });
    renderPreview({ imagePath: "", imageFile: file });

    await screen.findByAltText("立绘在画面中的预览效果");

    const formData = mockedApi.getPortraitPreview.mock.calls[0][0] as FormData;
    const uploaded = formData.get("file") as File | null;
    // 直接比较 File 对象会让 jest 在断言失败时尝试深拷贝它而崩溃，这里只校验关键属性
    expect(uploaded ? uploaded.name : null).toBe("portrait.png");
    expect(uploaded ? uploaded.size : 0).toBe(3);
    expect(formData.has("imagePath")).toBe(false);
  });

  test("背景库为空时提示先添加背景，且不请求渲染", async () => {
    mockedApi.getBackgrounds.mockResolvedValue([]);

    renderPreview();

    expect(await screen.findByText(/没有可用的背景图/)).toBeTruthy();
    expect(mockedApi.getPortraitPreview).not.toHaveBeenCalled();
  });

  test("渲染失败时展示后端返回的错误信息", async () => {
    const error = Object.assign(new Error("Request failed with status code 500"), {
      response: { data: { message: "没有可用的背景图，请先在资源管理的「背景」页添加背景" } },
    });
    mockedApi.getPortraitPreview.mockRejectedValue(error);

    renderPreview();

    expect(
      await screen.findByText(/没有可用的背景图，请先在资源管理的「背景」页添加背景/),
    ).toBeTruthy();
  });

  test("添加对比角色后按右侧偏移重新渲染，并显示在列表里", async () => {
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    await addComparePortrait("c_gre", "格雷高尔-常服");

    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2),
    );
    // 默认间距 24% × 1920 = 460.8 → 461；第一个加进来的站右侧
    expect(lastFormData().getAll("compare")).toEqual(["p_gre_1:461"]);
    expect(screen.getByText("格雷高尔")).toBeTruthy();
    expect(screen.getByText(/右侧 · 正常/)).toBeTruthy();
    // 选完自动收起选择器
    expect(screen.queryByRole("region", { name: "添加对比角色" })).toBeNull();
  });

  test("第二个对比角色站左侧，加满两个后不能再加", async () => {
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    await addComparePortrait("c_gre", "格雷高尔-常服");
    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2),
    );

    await addComparePortrait("c_roj", "罗佳-开心");
    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(3),
    );

    expect(lastFormData().getAll("compare")).toEqual([
      "p_gre_1:461",
      "p_roj_2:-461",
    ]);
    expect(screen.getByText("罗佳")).toBeTruthy();
    expect(screen.getByText(/左侧 · 开心/)).toBeTruthy();

    const addButton = screen.getByRole("button", {
      name: /添加对比角色/,
    }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(addButton.title).toBe("最多同时对比 2 个角色：先移除一个再加");
  });

  test("移除对比角色后重新渲染，并不再带 compare", async () => {
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    await addComparePortrait("c_gre", "格雷高尔-常服");
    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "移除对比角色 格雷高尔" }),
    );

    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(3),
    );
    expect(lastFormData().getAll("compare")).toEqual([]);
    expect(screen.queryByText("格雷高尔")).toBeNull();
  });

  test("拖动间距只在松手后重新渲染", async () => {
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    await addComparePortrait("c_gre", "格雷高尔-常服");
    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2),
    );

    const slider = screen.getByLabelText("对比角色间距") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "30" } });
    expect(screen.getByText("间距 30%")).toBeTruthy();
    // 拖动过程中不发请求
    expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(2);

    // 松键才提交：30% × 1920 = 576
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    await waitFor(() =>
      expect(mockedApi.getPortraitPreview).toHaveBeenCalledTimes(3),
    );
    expect(lastFormData().getAll("compare")).toEqual(["p_gre_1:576"]);
  });

  test("当前正在编辑的立绘不会出现在对比列表里", async () => {
    renderPreview({ currentCharacterId: "c_roj", currentPortraitId: "p_roj_1" });
    await screen.findByAltText("立绘在画面中的预览效果");

    // 默认挑"别的角色"（不是正在编辑的罗佳）
    fireEvent.click(screen.getByRole("button", { name: /添加对比角色/ }));
    const select = (await screen.findByLabelText("对比角色")) as HTMLSelectElement;
    expect(select.value).toBe("c_gre");

    // 切回罗佳：正在编辑的那张要藏掉，只剩另一张
    fireEvent.change(select, { target: { value: "c_roj" } });
    expect(await screen.findByText("罗佳-开心")).toBeTruthy();
    expect(screen.queryByText("罗佳-常服")).toBeNull();
  });

  test("角色列表加载失败时给出提示，点重试能恢复", async () => {
    mockedApi.getCharacters.mockRejectedValueOnce(new Error("boom"));
    renderPreview();
    await screen.findByAltText("立绘在画面中的预览效果");

    fireEvent.click(screen.getByRole("button", { name: /添加对比角色/ }));

    expect(
      await screen.findByText(/加载角色列表失败/),
    ).toBeTruthy();
    expect(
      screen.queryByText("格雷高尔-常服"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("格雷高尔-常服")).toBeTruthy();
  });

  test("Esc 先收起对比角色选择器，再按一次才关闭预览", async () => {
    const onClose = jest.fn();
    renderPreview({ onClose });
    await screen.findByAltText("立绘在画面中的预览效果");

    fireEvent.click(screen.getByRole("button", { name: /添加对比角色/ }));
    expect(
      await screen.findByRole("region", { name: "添加对比角色" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "添加对比角色" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
