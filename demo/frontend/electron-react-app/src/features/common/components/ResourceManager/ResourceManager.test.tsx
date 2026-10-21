import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ApiService from "@services/ApiService";
import ResourceManager from "./ResourceManager";

/**
 * 资源管理页的导入 / 导出入口：
 * - 页面顶部有「全部资源」导出与导入（一次迁移角色 + 背景 + 音频）；
 * - 背景、音效标签页与角色一致，都有「选择导出」（多选）与「导入」；
 * - 进入选择模式后每张卡片 / 条目都出现勾选框，勾选数量显示在「确认导出」上。
 */

const getCharacters = jest.spyOn(ApiService, "getCharacters");
const getBackgrounds = jest.spyOn(ApiService, "getBackgrounds");
const getAudios = jest.spyOn(ApiService, "getAudios");

const CHARACTER = {
  characterID: "c1",
  characterName: "角色A",
  height: 170,
  faction: "阵营",
  colorBg: "#000000",
  colorText: "#ffffff",
  tags: [],
  portraits: [],
};

const BACKGROUND = {
  uuid: "b1",
  name: "背景A",
  path: "/assets/backgrounds/a.png",
  thumbnailPath: "/assets/backgrounds/thumbnails/a.jpg",
  tags: [],
};

const AUDIO = {
  uuid: "a1",
  name: "音频A",
  path: "/assets/audios/a.mp3",
  type: "bgm",
  tags: [],
};

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getCharacters.mockResolvedValue([CHARACTER]);
  getBackgrounds.mockResolvedValue([BACKGROUND]);
  getAudios.mockResolvedValue([AUDIO]);
});

const renderManager = async () => {
  const utils = render(<ResourceManager />);
  // 等首屏资源加载完成（加载中... -> 资源库）
  expect(await screen.findByText("资源库")).toBeTruthy();
  return utils;
};

it("页面顶部提供全部资源的导入与导出", async () => {
  await renderManager();

  expect(screen.getByText(/导出全部资源/)).toBeTruthy();
  expect(screen.getByText(/导入全部资源/)).toBeTruthy();
});

it("背景标签页支持多选导出与导入", async () => {
  const { container } = await renderManager();

  fireEvent.click(screen.getByText("背景"));
  expect(await screen.findByPlaceholderText("搜索背景...")).toBeTruthy();
  expect(screen.getByText(/导入背景/)).toBeTruthy();

  // 未进入选择模式时不应该有勾选框
  expect(container.querySelectorAll(".background-card-checkbox").length).toBe(0);

  fireEvent.click(screen.getByText(/选择导出/));

  await waitFor(() =>
    expect(container.querySelectorAll(".background-card-checkbox").length).toBe(1),
  );
  expect(screen.getByText("全选")).toBeTruthy();
  expect(screen.getByText(/确认导出 \(0\)/)).toBeTruthy();

  // 勾选后「确认导出」显示数量
  const checkbox = container.querySelector(
    ".background-card-checkbox input[type=checkbox]",
  ) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(screen.getByText(/确认导出 \(1\)/)).toBeTruthy();

  // 取消后退出选择模式
  fireEvent.click(screen.getByText(/取消/));
  await waitFor(() =>
    expect(container.querySelectorAll(".background-card-checkbox").length).toBe(0),
  );
});

it("音效标签页支持多选导出与导入", async () => {
  const { container } = await renderManager();

  fireEvent.click(screen.getByText("音效"));
  expect(await screen.findByPlaceholderText("搜索音频...")).toBeTruthy();
  expect(screen.getByText(/导入音频/)).toBeTruthy();

  expect(container.querySelectorAll(".audio-item-checkbox").length).toBe(0);

  fireEvent.click(screen.getByText(/选择导出/));

  await waitFor(() =>
    expect(container.querySelectorAll(".audio-item-checkbox").length).toBe(1),
  );
  expect(screen.getByText("全选")).toBeTruthy();

  const checkbox = container.querySelector(
    ".audio-item-checkbox input[type=checkbox]",
  ) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(screen.getByText(/确认导出 \(1\)/)).toBeTruthy();
});
