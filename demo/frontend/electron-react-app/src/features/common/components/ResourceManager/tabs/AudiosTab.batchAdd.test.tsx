/**
 * 资源管理 → 音效 → 「➕ 添加音频」的**多选**接线测试。
 *
 * 与背景页签同一套交互（共用 `resourceTransfer.runFileBatch` 与 `ResourceBatchStatus`），
 * 这里只验音频侧的三件事：
 * 1. 选 1 个 → 打开编辑窗口，名称先填成文件名，点保存前不上传；
 * 2. 选多个 → 直接批量添加：名称取文件名、类型默认「背景音乐」，并刷新列表；
 * 3. 某个坏了只列一条原因，其它照常添加（不再弹 alert）。
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
  name: "舞台音乐",
  path: "/assets/audios/舞台音乐.mp3",
  type: AudioType.BGM,
  tags: [],
};

const mp3 = (name: string) => new File(["mp3"], name, { type: "audio/mpeg" });

/** 后端「上传音频」的返回 */
const uploadOk = (name: string) => ({
  filename: `${name}.mp3`,
  path: `/assets/audios/${name}.mp3`,
  originalFilename: `${name}.mp3`,
});

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

/** 「➕ 添加音频」用的多选 input（与导入 zip、弹窗里换文件的 input 靠 aria-label 区分） */
const addInput = () =>
  screen.getByLabelText("添加音频：选择文件（可多选）") as HTMLInputElement;

afterEach(() => {
  jest.restoreAllMocks();
});

test("选多个 → 逐个上传 + 建记录，名称取文件名、类型默认背景音乐，并刷新列表", async () => {
  const upload = jest
    .spyOn(ApiService, "uploadAudioFile")
    .mockImplementation(async (file: File) =>
      uploadOk(file.name.replace(/\.mp3$/, "")),
    );
  const addAudio = jest
    .spyOn(ApiService, "addAudio")
    .mockImplementation(async (audio: Audio) => audio);
  const getAudios = jest
    .spyOn(ApiService, "getAudios")
    .mockResolvedValue([AUDIO_A]);

  renderTab();
  expect(addInput().multiple).toBe(true);

  fireEvent.change(addInput(), {
    target: { files: [mp3("舞台音乐.mp3"), mp3("雨声.mp3")] },
  });

  expect(await screen.findByText(/已添加 2 个音频/)).toBeTruthy();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0][1]).toBe("舞台音乐");
  expect(addAudio).toHaveBeenCalledTimes(2);
  expect(addAudio.mock.calls[0][0]).toMatchObject({
    name: "舞台音乐",
    path: "/assets/audios/舞台音乐.mp3",
    type: AudioType.BGM,
    tags: [],
  });
  expect(getAudios).toHaveBeenCalledTimes(1);

  // 多选不打开编辑窗口（直接批量添加）
  expect(screen.queryByText("添加音频")).toBeNull();
});

test("只选 1 个：打开编辑窗口，名称先填成文件名；点保存前不上传", async () => {
  const upload = jest.spyOn(ApiService, "uploadAudioFile");

  renderTab();
  fireEvent.change(addInput(), { target: { files: [mp3("雨声.mp3")] } });

  // 弹窗标题（添加，不是编辑）+ 名称已按文件名填好
  expect(await screen.findByText("添加音频")).toBeTruthy();
  expect(screen.getByDisplayValue("雨声")).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
});

test("某个坏了：只列一条原因，其它照常添加（不弹 alert）", async () => {
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  jest
    .spyOn(ApiService, "uploadAudioFile")
    .mockRejectedValueOnce({
      response: { data: { message: "不支持的音频格式" } },
    })
    .mockResolvedValueOnce(uploadOk("雨声"));
  jest
    .spyOn(ApiService, "addAudio")
    .mockImplementation(async (audio: Audio) => audio);
  jest.spyOn(ApiService, "getAudios").mockResolvedValue([AUDIO_A]);

  renderTab();
  fireEvent.change(addInput(), {
    target: { files: [mp3("坏音频.mp3"), mp3("雨声.mp3")] },
  });

  expect(
    await screen.findByText(
      /已添加 1 个音频；另有 1 个文件没添加：坏音频\.mp3（不支持的音频格式）/,
    ),
  ).toBeTruthy();
  expect(alertSpy).not.toHaveBeenCalled();
});
