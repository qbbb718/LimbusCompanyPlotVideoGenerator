import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MyCharacter } from "@types";
import ApiService from "@services/ApiService";
import NamePreview from "./NamePreview";

jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: {
    renderCharacterCardPreview: jest.fn(),
  },
}));

const mockedApi = ApiService as unknown as {
  renderCharacterCardPreview: jest.Mock;
};

const SAVED_CARD_URL = "/api/character-card/char_1";

const CHARACTER: MyCharacter = {
  characterID: "char_1",
  characterName: "测试角色",
  height: 170,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [],
  characterCardImagePath: SAVED_CARD_URL,
};

/**
 * 角色名片预览：
 * - 默认显示后端已保存的名片图片；
 * - 图片右上角有刷新按钮，点击后把「当前参数」交给后端重新渲染并立刻换上新图，
 *   不需要先保存、也不需要重启应用；
 * - 参数改过之后，之前渲染的图不再冒充当前参数的效果；
 * - 名称为空 / 后端没有接口 / 图片加载失败时都要给出可执行的提示。
 */
describe("角色名片预览", () => {
  beforeAll(() => {
    // jsdom 没有实现 createObjectURL/revokeObjectURL，这里按真实行为 mock 掉
    (URL as any).createObjectURL = jest.fn(() => "blob:card");
    (URL as any).revokeObjectURL = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.renderCharacterCardPreview.mockResolvedValue("blob:card");
  });

  const renderPreview = (overrides: Partial<MyCharacter> = {}) => {
    const character = { ...CHARACTER, ...overrides };
    const view = render(<NamePreview character={character} />);
    return { character, ...view };
  };

  const getCardImage = () => screen.getByAltText("角色名片") as HTMLImageElement;

  test("默认显示已保存的名片，并提供右上角刷新按钮", () => {
    renderPreview();

    expect(getCardImage().getAttribute("src")).toMatch(
      /^http:\/\/localhost:8081\/api\/character-card\/char_1\?v=\d+$/,
    );
    expect(screen.getByLabelText("刷新名片图片")).toBeTruthy();
  });

  test("点击刷新用当前参数重新渲染，并立刻换上新图", async () => {
    const { character } = renderPreview();

    fireEvent.click(screen.getByLabelText("刷新名片图片"));

    await waitFor(() =>
      expect(getCardImage().getAttribute("src")).toBe("blob:card"),
    );
    expect(mockedApi.renderCharacterCardPreview).toHaveBeenCalledTimes(1);
    expect(mockedApi.renderCharacterCardPreview).toHaveBeenCalledWith(character);
  });

  test("改名后刷新：请求的是新参数，且之前渲染的旧图不再显示", async () => {
    const { rerender } = renderPreview();

    fireEvent.click(screen.getByLabelText("刷新名片图片"));
    await waitFor(() =>
      expect(getCardImage().getAttribute("src")).toBe("blob:card"),
    );

    // 用户继续改名字，但还没点刷新：旧图不能继续冒充新参数的效果
    rerender(
      <NamePreview character={{ ...CHARACTER, characterName: "改过的名字" }} />,
    );
    expect(getCardImage().getAttribute("src")).toContain(SAVED_CARD_URL);

    fireEvent.click(screen.getByLabelText("刷新名片图片"));
    await waitFor(() =>
      expect(mockedApi.renderCharacterCardPreview).toHaveBeenCalledTimes(2),
    );
    expect(mockedApi.renderCharacterCardPreview.mock.calls[1][0]).toEqual(
      expect.objectContaining({ characterName: "改过的名字" }),
    );
  });

  test("名称为空时不请求后端，提示先填写角色名称", async () => {
    renderPreview({ characterName: "   ", characterCardImagePath: undefined });

    fireEvent.click(screen.getByLabelText("刷新名片图片"));

    expect(await screen.findByText(/请先填写角色名称/)).toBeTruthy();
    expect(mockedApi.renderCharacterCardPreview).not.toHaveBeenCalled();
  });

  test("后端没有名片预览接口时提示重启后端", async () => {
    mockedApi.renderCharacterCardPreview.mockRejectedValue({
      response: { status: 404 },
    });

    renderPreview();
    fireEvent.click(screen.getByLabelText("刷新名片图片"));

    expect(await screen.findByText(/请重启后端服务/)).toBeTruthy();
  });

  test("新角色刷新出名片后说明这只是预览图，保存后才会正式生成", async () => {
    renderPreview({ characterCardImagePath: undefined });

    // 还没有名片：先显示文字占位
    expect(screen.queryByAltText("角色名片")).toBeNull();

    fireEvent.click(screen.getByLabelText("刷新名片图片"));

    await waitFor(() =>
      expect(getCardImage().getAttribute("src")).toBe("blob:card"),
    );
    expect(
      await screen.findByText(/保存角色后会生成正式名片/),
    ).toBeTruthy();
  });

  test("已保存的名片加载失败时退化为文字预览", async () => {
    renderPreview();

    fireEvent.error(getCardImage());

    expect(await screen.findByText("名片图片加载失败")).toBeTruthy();
    // 退化为文字预览，但仍保留字色/底色，并且刷新按钮仍在
    expect(screen.getByText("测试角色")).toBeTruthy();
    expect(screen.getByLabelText("刷新名片图片")).toBeTruthy();
  });
});
