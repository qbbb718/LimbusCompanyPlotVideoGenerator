/**
 * 资源管理 → 背景 → 「📥 导入背景」的**批量导入**接线测试。
 *
 * 验收点：
 * 1. 导入框允许多选（`multiple`），一次选两个包就发两次导入请求；
 * 2. 导入过程中按钮与提示条都要显示"第几个 / 共几个 + 当前包名"，否则用户以为没点上；
 * 3. 某个包坏了只列一条原因，成功的那几个照样导入并刷新列表；
 * 4. 结果用本页提示条回显，不再弹 alert（Electron 里 alert 关掉会抢走键盘焦点）。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import ApiService from "@services/ApiService";
import type { Background } from "@types";
import BackgroundsTab from "./BackgroundsTab";

const BACKGROUND_A: Background = {
  uuid: "bg_a",
  name: "背景A",
  path: "/assets/backgrounds/a.png",
  tags: [],
};

const BACKGROUND_B: Background = {
  uuid: "bg_b",
  name: "背景B",
  path: "/assets/backgrounds/b.png",
  tags: [],
};

const zip = (name: string) =>
  new File(["zip"], name, { type: "application/zip" });

const renderTab = () => {
  const setBackgrounds = jest.fn();
  render(
    <BackgroundsTab
      backgrounds={[]}
      searchTerm=""
      setSearchTerm={jest.fn()}
      openResourceFolder={jest.fn()}
      setBackgrounds={setBackgrounds}
    />,
  );
  return { setBackgrounds };
};

/** 导入用的隐藏 input（与「添加背景」选图的 input 是两个，靠 aria-label 区分） */
const importInput = () =>
  screen.getByLabelText("导入背景资源包（可多选）") as HTMLInputElement;

afterEach(() => {
  jest.restoreAllMocks();
});

test("导入框支持多选：一次选两个包 → 逐个上传 → 汇总结果 + 刷新列表", async () => {
  const importBackgrounds = jest
    .spyOn(ApiService, "importBackgrounds")
    .mockResolvedValueOnce([BACKGROUND_A])
    .mockResolvedValueOnce([BACKGROUND_B]);
  const getBackgrounds = jest
    .spyOn(ApiService, "getBackgrounds")
    .mockResolvedValue([BACKGROUND_A, BACKGROUND_B]);
  const { setBackgrounds } = renderTab();

  // 批量导入的前提：输入框本身允许多选
  expect(importInput().multiple).toBe(true);

  fireEvent.change(importInput(), {
    target: { files: [zip("a.zip"), zip("b.zip")] },
  });

  expect(
    await screen.findByText("已导入 2 张背景（2 个背景资源包）"),
  ).toBeTruthy();
  expect(importBackgrounds).toHaveBeenCalledTimes(2);
  // 导入后列表要重新拉一次（新背景只存在于后端，本地列表里没有）
  expect(getBackgrounds).toHaveBeenCalledTimes(1);
  expect(setBackgrounds).toHaveBeenCalledWith([BACKGROUND_A, BACKGROUND_B]);
});

test("导入过程中显示进度：按钮与提示条都有「第几个 / 共几个」和当前包名", async () => {
  let finishFirst: (value: Background[]) => void = () => {};
  const firstPending = new Promise<Background[]>((resolve) => {
    finishFirst = resolve;
  });
  jest
    .spyOn(ApiService, "importBackgrounds")
    .mockReturnValueOnce(firstPending)
    .mockResolvedValueOnce([BACKGROUND_B]);
  jest.spyOn(ApiService, "getBackgrounds").mockResolvedValue([BACKGROUND_B]);

  renderTab();
  fireEvent.change(importInput(), {
    target: { files: [zip("a.zip"), zip("b.zip")] },
  });

  // 第一个包还没回来：进度条与按钮上都要能看到读数
  expect(
    await screen.findByText(/正在导入背景 1\/2：a\.zip…/),
  ).toBeTruthy();
  expect(screen.getByText(/⏳ 导入中 1\/2…/)).toBeTruthy();

  await act(async () => {
    finishFirst([BACKGROUND_A]);
  });

  expect(
    await screen.findByText("已导入 2 张背景（2 个背景资源包）"),
  ).toBeTruthy();
  // 结束后进度条让位给结果提示
  expect(screen.queryByText(/正在导入背景/)).toBeNull();
});

test("某个包坏了：只列一条原因，成功的那几个照样导入并刷新列表", async () => {
  jest
    .spyOn(ApiService, "importBackgrounds")
    .mockRejectedValueOnce({
      response: { data: { message: "压缩包里没有 background.json" } },
    })
    .mockResolvedValueOnce([BACKGROUND_A]);
  const getBackgrounds = jest
    .spyOn(ApiService, "getBackgrounds")
    .mockResolvedValue([BACKGROUND_A]);

  renderTab();
  fireEvent.change(importInput(), {
    target: { files: [zip("坏包.zip"), zip("好包.zip")] },
  });

  expect(
    await screen.findByText(
      /已导入 1 张背景（1 个背景资源包）；另有 1 个背景资源包没导入：坏包\.zip（压缩包里没有 background\.json）/,
    ),
  ).toBeTruthy();
  expect(getBackgrounds).toHaveBeenCalledTimes(1);
});

test("全部失败：提示条报错并点名每个包，且不弹 alert", async () => {
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  jest
    .spyOn(ApiService, "importBackgrounds")
    .mockRejectedValue(new Error("Network Error"));
  const getBackgrounds = jest.spyOn(ApiService, "getBackgrounds");

  renderTab();
  fireEvent.change(importInput(), {
    target: { files: [zip("a.zip"), zip("b.zip")] },
  });

  expect(
    await screen.findByText(
      /2 个背景资源包都没导入成功：a\.zip（导入失败（Network Error））/,
    ),
  ).toBeTruthy();
  // 一个都没成功就不必再去拉列表
  expect(getBackgrounds).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
});
