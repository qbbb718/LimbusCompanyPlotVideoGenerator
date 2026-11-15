/**
 * 资源管理 → 音效 → 「📥 导入音频」的**批量导入**接线测试。
 *
 * 与背景页签同一套交互（共用 `resourceTransfer.importResourceBundles` 与
 * `ResourceBatchStatus` 提示条），这里只验音频侧的三件事：
 * 1. 导入框允许多选，一次选多个包就发多次请求；
 * 2. 一个包坏了不影响其它包；
 * 3. 汇总文案用音频的说法（个音频 / 音频资源包），并刷新本地列表。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import ApiService from "@services/ApiService";
import { AudioType } from "@types";
import type { Audio } from "@types";
import AudiosTab from "./AudiosTab";

const AUDIO_A: Audio = {
  uuid: "audio_a",
  name: "音乐A",
  path: "/assets/audios/a.mp3",
  type: AudioType.BGM,
  tags: [],
};

const AUDIO_B: Audio = {
  uuid: "audio_b",
  name: "音效B",
  path: "/assets/audios/b.wav",
  type: AudioType.SFX,
  tags: [],
};

const zip = (name: string) =>
  new File(["zip"], name, { type: "application/zip" });

const renderTab = () => {
  const setAudios = jest.fn();
  render(
    <AudiosTab
      audios={[]}
      searchTerm=""
      setSearchTerm={jest.fn()}
      openResourceFolder={jest.fn()}
      setAudios={setAudios}
    />,
  );
  return { setAudios };
};

/** 导入用的隐藏 input（与「添加音频」选文件的 input 是两个，靠 aria-label 区分） */
const importInput = () =>
  screen.getByLabelText("导入音频资源包（可多选）") as HTMLInputElement;

afterEach(() => {
  jest.restoreAllMocks();
});

test("导入框支持多选：一次选两个包 → 逐个上传 → 汇总结果 + 刷新列表", async () => {
  const importAudios = jest
    .spyOn(ApiService, "importAudios")
    .mockResolvedValueOnce([AUDIO_A])
    .mockResolvedValueOnce([AUDIO_B]);
  const getAudios = jest
    .spyOn(ApiService, "getAudios")
    .mockResolvedValue([AUDIO_A, AUDIO_B]);
  const { setAudios } = renderTab();

  expect(importInput().multiple).toBe(true);

  fireEvent.change(importInput(), {
    target: { files: [zip("a.zip"), zip("b.zip")] },
  });

  expect(
    await screen.findByText("已导入 2 个音频（2 个音频资源包）"),
  ).toBeTruthy();
  expect(importAudios).toHaveBeenCalledTimes(2);
  expect(getAudios).toHaveBeenCalledTimes(1);
  expect(setAudios).toHaveBeenCalledWith([AUDIO_A, AUDIO_B]);
});

test("某个包坏了：只列一条原因，成功的照常导入（不再弹 alert）", async () => {
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  jest
    .spyOn(ApiService, "importAudios")
    .mockRejectedValueOnce({
      response: { data: { message: "资源包里没有找到 audios.json" } },
    })
    .mockResolvedValueOnce([AUDIO_A]);
  const getAudios = jest
    .spyOn(ApiService, "getAudios")
    .mockResolvedValue([AUDIO_A]);

  renderTab();
  fireEvent.change(importInput(), {
    target: { files: [zip("坏包.zip"), zip("好包.zip")] },
  });

  expect(
    await screen.findByText(
      /已导入 1 个音频（1 个音频资源包）；另有 1 个音频资源包没导入：坏包\.zip（资源包里没有找到 audios\.json）/,
    ),
  ).toBeTruthy();
  expect(getAudios).toHaveBeenCalledTimes(1);
  expect(alertSpy).not.toHaveBeenCalled();
});
