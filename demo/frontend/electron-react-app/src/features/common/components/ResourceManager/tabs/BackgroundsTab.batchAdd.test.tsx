/**
 * 资源管理 → 背景 → 「➕ 添加背景」的**多选**接线测试。
 *
 * 验收点：
 * 1. 添加框允许多选（`multiple`）；
 * 2. 选 1 张 → 打开编辑窗口，名称先填成文件名（还没上传，点保存才落盘）；
 * 3. 选多张 → 直接批量添加：每张一次 `上传原图 + 建记录`，名称取文件名、标签留空；
 * 4. 某张坏了只列一条原因，其它照常添加；结果在提示条里，不再弹 alert。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import ApiService from "@services/ApiService";
import type { Background } from "@types";
import BackgroundsTab from "./BackgroundsTab";

const BACKGROUND_A: Background = {
  uuid: "bg_a",
  name: "场景A",
  path: "/assets/backgrounds/场景A.png",
  tags: [],
};

const png = (name: string) => new File(["png"], name, { type: "image/png" });

/** 后端「上传背景原图」的返回（真实接口会顺带生成缩略图） */
const uploadOk = (name: string) => ({
  filename: `${name}.png`,
  imagePath: `/assets/backgrounds/${name}.png`,
  autoThumbnailPath: `/assets/backgrounds/thumbnails/thumb_${name}.png`,
});

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

/** 「➕ 添加背景」用的多选 input（与导入 zip、弹窗里换图的 input 靠 aria-label 区分） */
const addInput = () =>
  screen.getByLabelText("添加背景：选择图片（可多选）") as HTMLInputElement;

afterEach(() => {
  jest.restoreAllMocks();
});

test("选多张 → 逐个上传 + 建记录，名称取文件名、标签留空，并刷新列表", async () => {
  const upload = jest
    .spyOn(ApiService, "uploadBackgroundFile")
    .mockImplementation(async (file: File) =>
      uploadOk(file.name.replace(/\.png$/, "")),
    );
  const addBackground = jest
    .spyOn(ApiService, "addBackground")
    .mockImplementation(async (background: Background) => background);
  const getBackgrounds = jest
    .spyOn(ApiService, "getBackgrounds")
    .mockResolvedValue([BACKGROUND_A]);

  renderTab();
  expect(addInput().multiple).toBe(true);

  fireEvent.change(addInput(), {
    target: { files: [png("场景A.png"), png("场景B.png")] },
  });

  expect(await screen.findByText(/已添加 2 张背景/)).toBeTruthy();
  expect(upload).toHaveBeenCalledTimes(2);
  // 名称 = 文件名去掉后缀（传给后端 upload 的 name）
  expect(upload.mock.calls[0][1]).toBe("场景A");
  expect(addBackground).toHaveBeenCalledTimes(2);
  expect(addBackground.mock.calls[0][0]).toMatchObject({
    name: "场景A",
    path: "/assets/backgrounds/场景A.png",
    thumbnailPath: "/assets/backgrounds/thumbnails/thumb_场景A.png",
    tags: [],
  });
  expect(getBackgrounds).toHaveBeenCalledTimes(1);

  // 多选不打开编辑窗口（直接批量添加），也不弹 alert
  expect(screen.queryByText("添加背景")).toBeNull();
});

test("只选 1 张：打开编辑窗口，名称先填成文件名；点保存前不上传", async () => {
  const upload = jest.spyOn(ApiService, "uploadBackgroundFile");

  renderTab();
  fireEvent.change(addInput(), { target: { files: [png("月光庭院.png")] } });

  // 弹窗标题（添加，不是编辑）+ 名称已按文件名填好
  expect(await screen.findByText("添加背景")).toBeTruthy();
  expect(screen.getByDisplayValue("月光庭院")).toBeTruthy();
  // 还没点「保存」：一个字都不能落盘
  expect(upload).not.toHaveBeenCalled();
});

test("某张坏了：只列一条原因，其它张照常添加", async () => {
  jest
    .spyOn(ApiService, "uploadBackgroundFile")
    .mockRejectedValueOnce({
      response: { data: { message: "不支持的图片格式" } },
    })
    .mockResolvedValueOnce(uploadOk("场景B"));
  jest
    .spyOn(ApiService, "addBackground")
    .mockImplementation(async (background: Background) => background);
  jest.spyOn(ApiService, "getBackgrounds").mockResolvedValue([BACKGROUND_A]);

  renderTab();
  fireEvent.change(addInput(), {
    target: { files: [png("坏图.png"), png("场景B.png")] },
  });

  expect(
    await screen.findByText(
      /已添加 1 张背景；另有 1 个文件没添加：坏图\.png（不支持的图片格式）/,
    ),
  ).toBeTruthy();
});

test("添加过程中显示进度：按钮与提示条都有「第几个 / 共几个」和当前文件名", async () => {
  let finishFirst: (value: ReturnType<typeof uploadOk>) => void = () => {};
  const pending = new Promise<ReturnType<typeof uploadOk>>((resolve) => {
    finishFirst = resolve;
  });
  jest
    .spyOn(ApiService, "uploadBackgroundFile")
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(uploadOk("场景B"));
  jest
    .spyOn(ApiService, "addBackground")
    .mockImplementation(async (background: Background) => background);
  jest.spyOn(ApiService, "getBackgrounds").mockResolvedValue([BACKGROUND_A]);

  renderTab();
  fireEvent.change(addInput(), {
    target: { files: [png("场景A.png"), png("场景B.png")] },
  });

  expect(
    await screen.findByText(/正在添加背景 1\/2：场景A\.png…/),
  ).toBeTruthy();
  expect(screen.getByText(/⏳ 添加中 1\/2…/)).toBeTruthy();

  finishFirst(uploadOk("场景A"));

  expect(await screen.findByText(/已添加 2 张背景/)).toBeTruthy();
  expect(screen.queryByText(/正在添加背景/)).toBeNull();
});
