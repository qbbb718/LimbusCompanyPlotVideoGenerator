/**
 * 资源管理 → 角色 →「立绘列表」的**多选 + 批量操作**回归测试。
 *
 * <p>锁死的产品约定（用户确认过的三条）：
 * <ol>
 *   <li>「批量选择」放在「批量导入立绘」右侧，点一下进入多选模式；</li>
 *   <li>默认立绘可以被勾选：套用裁剪时**跳过它自己**，批量删除时在确认框里**多一段警告**，
 *       删掉后剩下的第一张自动成为默认立绘（与单张删除一致）；</li>
 *   <li>全部成功 → 清空选中并退出多选；部分失败 → 只保留失败项、留在多选里直接重试。</li>
 * </ol>
 *
 * <p>图片解码在 jsdom 里不会发生，所以这里把 `imageUtils` 的两个入口换成假实现：
 * 所有立绘都当作 1000×1500，缩略图生成直接给一个 Blob。
 * 于是默认立绘 `{100, 200, 400}` 套到同样尺寸的立绘上还是 `{100, 200, 400}`，
 * 断言可以精确到像素。
 */
/* eslint-disable testing-library/no-container, testing-library/no-node-access --
 * 立绘卡片没有可用的 role / aria 名称，只能按 `.portrait-card` 取 DOM，
 * 与 CharacterDetailModal.portraitOrder.test.tsx 的写法保持一致。 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MyCharacter, Portrait } from "@types";
import ApiService from "@services/ApiService";
import {
  createCroppedImageFromElement,
  loadImageElement,
} from "@features/common/utils/imageUtils";
import CharacterDetailModal from "./CharacterDetailModal";
import { ConfirmDialogHost } from "@features/common/components/ConfirmDialog";

jest.mock("@features/common/utils/imageUtils", () => {
  const actual = jest.requireActual("@features/common/utils/imageUtils");
  return {
    ...actual,
    loadImageElement: jest.fn(async () => ({
      naturalWidth: 1000,
      naturalHeight: 1500,
    })),
    createCroppedImageFromElement: jest.fn(
      async () => new Blob(["thumb"], { type: "image/png" }),
    ),
  };
});

const DEFAULT_CROP = { faceX: 100, faceY: 200, length: 400 };

const makePortrait = (
  id: string,
  portName: string,
  crop: { faceX: number; faceY: number; length: number },
  isDefault = false,
): Portrait => ({
  portraitID: id,
  characterID: "char_batch_test",
  imagePath: `char_batch_test/${id}.png`,
  portName,
  emotion: "normal" as any,
  faceX: crop.faceX,
  faceY: crop.faceY,
  length: crop.length,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/char_batch_test/thumbnails/thumbnail_${id}.png`,
  defaultPortrait: isDefault,
});

const makeCharacter = (overrides: Partial<MyCharacter> = {}): MyCharacter => ({
  characterID: "char_batch_test",
  characterName: "格里高尔",
  height: 168,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [
    makePortrait("default", "立绘-默认", DEFAULT_CROP, true),
    makePortrait("b", "立绘-B", { faceX: 10, faceY: 20, length: 100 }),
    makePortrait("c", "立绘-C", { faceX: 30, faceY: 40, length: 120 }),
  ],
  ...overrides,
});

const renderModal = (character: MyCharacter = makeCharacter()) =>
  render(
    <>
      <CharacterDetailModal
        character={character}
        portraits={character.portraits || []}
        isNewCharacter={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
      <ConfirmDialogHost />
    </>,
  );

/** 立绘列表里每张卡片的标题（顺序 = 立绘顺序） */
const cardTitles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll(".portrait-card h4")).map(
    (node) => node.textContent || "",
  );

/** 批量操作条 */
const selectionBar = () =>
  screen.getByRole("group", { name: "批量选择立绘" });

/** 批量操作条里的按钮（避免撞上标题栏的「删除角色」） */
const selectionButton = (name: string | RegExp) =>
  within(selectionBar()).getByRole("button", { name });

/** 勾选某张立绘 */
const togglePortrait = (portName: string) =>
  fireEvent.click(
    screen.getByRole("checkbox", { name: `选择立绘 ${portName}` }),
  );

const enterSelectionMode = () =>
  fireEvent.click(screen.getByRole("button", { name: "批量选择" }));

describe("角色详情-立绘批量选择", () => {
  let deletePortrait: jest.SpyInstance;
  let uploadPortraitThumbnail: jest.SpyInstance;
  let updateCharacter: jest.SpyInstance;

  beforeEach(() => {
    // 图片解码在 jsdom 里不会发生：所有立绘都当作 1000×1500，缩略图直接给一个 Blob。
    // CRA 的 jest 配置开了 resetMocks（每个用例前清掉实现），所以这里每次都要重新填
    (loadImageElement as jest.Mock).mockResolvedValue({
      naturalWidth: 1000,
      naturalHeight: 1500,
    });
    (createCroppedImageFromElement as jest.Mock).mockResolvedValue(
      new Blob(["thumb"], { type: "image/png" }),
    );

    // CRA 的 jest 配置开了 resetMocks：实现要在每个用例前重新填
    deletePortrait = jest
      .spyOn(ApiService, "deletePortrait")
      .mockResolvedValue(undefined as any);
    uploadPortraitThumbnail = jest
      .spyOn(ApiService, "uploadPortraitThumbnail")
      .mockResolvedValue(
        "/assets/characters/char_batch_test/thumbnails/thumbnail_new.png",
      );
    updateCharacter = jest
      .spyOn(ApiService, "updateCharacter")
      .mockImplementation(async (_id: string, character: MyCharacter) => character);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("进入 / 退出多选", () => {
    it("点「批量选择」进入：出现全选与已选数量，单张操作收起；点「取消」退出并恢复", () => {
      const { container } = renderModal();

      // 默认状态下没有批量操作条，卡片带单张操作
      expect(
        screen.queryByRole("group", { name: "批量选择立绘" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "批量选择" })).toBeInTheDocument();

      enterSelectionMode();

      expect(selectionBar()).toBeInTheDocument();
      // 批量操作条放在吸顶容器里：列表滚多远都停在内容区顶部（样式在 CharacterModal.css）
      const dock = container.querySelector<HTMLElement>(
        ".portrait-selection-dock",
      );
      expect(dock).not.toBeNull();
      expect(dock).toContainElement(selectionBar());
      expect(screen.getByText("已选 0 / 3 张")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "选择立绘 立绘-B" }),
      ).toBeInTheDocument();
      // 多选时单张的「编辑 / 设为默认 / 删除」收起，避免误触
      expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
      expect(cardTitles(container)).toEqual([
        "立绘-默认",
        "立绘-B",
        "立绘-C",
      ]);

      fireEvent.click(selectionButton("取消"));

      expect(
        screen.queryByRole("group", { name: "批量选择立绘" }),
      ).not.toBeInTheDocument();
      expect(container.querySelector(".portrait-selection-dock")).toBeNull();
      expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(3);
      expect(screen.getByRole("button", { name: "批量选择" })).toBeInTheDocument();
    });
  });

  describe("勾选 / 全选 / 数量", () => {
    it("无选中项时两个批量按钮都置灰，勾选后启用并显示数量", () => {
      renderModal();
      enterSelectionMode();

      const cropButton = selectionButton(/沿用默认立绘裁剪/);
      const deleteButton = selectionButton(/^删除/);
      expect(cropButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();

      togglePortrait("立绘-B");

      expect(screen.getByText("已选 1 / 3 张")).toBeInTheDocument();
      expect(selectionButton(/沿用默认立绘裁剪/)).toBeEnabled();
      expect(selectionButton(/^删除/)).toBeEnabled();
      // 按钮上写明本次作用范围（默认立绘不参与裁剪，所以裁剪按钮是 1）
      expect(selectionButton(/沿用默认立绘裁剪/)).toHaveTextContent(
        "沿用默认立绘裁剪 (1)",
      );
      expect(selectionButton(/^删除/)).toHaveTextContent("删除 (1)");
    });

    it("全选 / 取消全选，并在标题下方显示正确数量", () => {
      renderModal();
      enterSelectionMode();

      // 「全选」是勾选框，给它一个可读的名字
      const selectAll = within(selectionBar()).getByRole("checkbox", {
        name: "全选",
      });
      fireEvent.click(selectAll);

      expect(screen.getByText("已选 3 / 3 张")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "选择立绘 立绘-默认" }),
      ).toBeChecked();
      expect(selectAll).toBeChecked();
      // 默认立绘被选中但不算裁剪目标：套裁剪按钮显示 (2)
      expect(selectionButton(/沿用默认立绘裁剪/)).toHaveTextContent(
        "沿用默认立绘裁剪 (2)",
      );

      fireEvent.click(selectAll);

      expect(screen.getByText("已选 0 / 3 张")).toBeInTheDocument();
      expect(selectionButton(/沿用默认立绘裁剪/)).toBeDisabled();
    });

    it("点卡片本身（不只点勾选框）也能勾选", () => {
      const { container } = renderModal();
      enterSelectionMode();

      const secondCard = container.querySelectorAll<HTMLElement>(
        ".portrait-card",
      )[1];
      fireEvent.click(within(secondCard).getByText("立绘-B"));

      expect(screen.getByText("已选 1 / 3 张")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "选择立绘 立绘-B" }),
      ).toBeChecked();
    });

    it("角色一张立绘都没有时，「沿用默认立绘裁剪」置灰并提示先设置默认立绘", () => {
      renderModal(makeCharacter({ portraits: [] }));
      enterSelectionMode();

      const cropButton = selectionButton(/沿用默认立绘裁剪/);
      expect(cropButton).toBeDisabled();
      expect(cropButton).toHaveAttribute(
        "title",
        expect.stringContaining("还没有默认立绘"),
      );
      expect(screen.getByText("已选 0 / 0 张")).toBeInTheDocument();
      expect(
        within(selectionBar()).getByRole("checkbox", { name: "全选" }),
      ).toBeDisabled();
    });
  });

  describe("批量沿用默认立绘裁剪", () => {
    it("只改选中的立绘：裁剪与默认立绘一致，未选中的原样不动", async () => {
      renderModal();
      enterSelectionMode();
      togglePortrait("立绘-B");

      fireEvent.click(selectionButton(/沿用默认立绘裁剪/));

      // 成功后给结果反馈并自动退出多选
      expect(
        await screen.findByText(/已按比例更新 选中的 1 张立绘的裁剪/),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole("group", { name: "批量选择立绘" }),
        ).not.toBeInTheDocument(),
      );

      // 只给选中的那张重算了缩略图
      expect(uploadPortraitThumbnail).toHaveBeenCalledTimes(1);
      expect(uploadPortraitThumbnail.mock.calls[0][1]).toBe("b");

      // 保存时把新裁剪一起提交：B 变成默认立绘的裁剪，C 与默认立绘本身都没动
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

      const saved = updateCharacter.mock.calls[0][1] as MyCharacter;
      const byId = (id: string) =>
        (saved.portraits || []).find((p) => p.portraitID === id);
      expect(byId("b")).toMatchObject(DEFAULT_CROP);
      expect(byId("c")).toMatchObject({ faceX: 30, faceY: 40, length: 120 });
      expect(byId("default")).toMatchObject(DEFAULT_CROP);
      // 角色的其它数据不受批量操作影响
      expect(saved.characterName).toBe("格里高尔");
      expect(saved.height).toBe(168);
      expect((saved.portraits || []).map((p) => p.portraitID)).toEqual([
        "default",
        "b",
        "c",
      ]);
    });

    it("选中项包含默认立绘时跳过它自己（不重算它的缩略图）", async () => {
      renderModal();
      enterSelectionMode();
      fireEvent.click(
        within(selectionBar()).getByRole("checkbox", { name: "全选" }),
      );

      fireEvent.click(selectionButton(/沿用默认立绘裁剪/));

      expect(
        await screen.findByText(/已按比例更新 选中的 2 张立绘的裁剪/),
      ).toBeInTheDocument();
      const touchedIds = uploadPortraitThumbnail.mock.calls.map(
        (call) => call[1],
      );
      expect(touchedIds.sort()).toEqual(["b", "c"]);
      expect(touchedIds).not.toContain("default");
    });

    it("默认立绘还没框好头部时按钮置灰，title 说明要先框好", () => {
      renderModal(
        makeCharacter({
          portraits: [
            makePortrait("default", "立绘-默认", {
              faceX: 0,
              faceY: 0,
              length: 0,
            }, true),
            makePortrait("b", "立绘-B", { faceX: 10, faceY: 20, length: 100 }),
          ],
        }),
      );
      enterSelectionMode();
      togglePortrait("立绘-B");

      const cropButton = selectionButton(/沿用默认立绘裁剪/);
      expect(cropButton).toBeDisabled();
      expect(cropButton).toHaveAttribute(
        "title",
        expect.stringContaining("还没框好头部"),
      );
    });

    it("只选中默认立绘时置灰并提示「它不需要套用自己的裁剪」", () => {
      renderModal();
      enterSelectionMode();
      togglePortrait("立绘-默认");

      const cropButton = selectionButton(/沿用默认立绘裁剪/);
      expect(cropButton).toBeDisabled();
      expect(cropButton).toHaveAttribute(
        "title",
        expect.stringContaining("默认立绘本身"),
      );
      // 删除仍然可以（默认立绘允许删，确认框里会额外警告）
      expect(selectionButton(/^删除/)).toBeEnabled();
    });
  });

  describe("批量删除", () => {
    it("先确认（写明张数与不可恢复），确认后删除、刷新列表并退出多选", async () => {
      const { container } = renderModal();
      enterSelectionMode();
      togglePortrait("立绘-B");
      togglePortrait("立绘-C");

      fireEvent.click(selectionButton(/^删除/));

      const dialog = await screen.findByRole("dialog", {
        name: "批量删除立绘",
      });
      expect(
        within(dialog).getByText(/确定要删除选中的 2 张立绘吗？删除后不可恢复/),
      ).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole("button", { name: "删除 2 张" }));

      await waitFor(() => expect(deletePortrait).toHaveBeenCalledTimes(2));
      expect(deletePortrait.mock.calls.map((call) => call[1]).sort()).toEqual([
        "b",
        "c",
      ]);
      const message = await screen.findByText("已删除 2 张立绘。");
      expect(message).toBeInTheDocument();
      // 退出多选后结果提示仍留在吸顶容器里：滚到列表深处也看得到
      const statusDock = document.querySelector<HTMLElement>(
        ".portrait-selection-dock",
      );
      expect(statusDock).not.toBeNull();
      expect(statusDock).toContainElement(message);
      // 列表按删除结果刷新，且自动退出多选
      expect(cardTitles(container)).toEqual(["立绘-默认"]);
      expect(
        screen.queryByRole("group", { name: "批量选择立绘" }),
      ).not.toBeInTheDocument();
    });

    it("执行中显示加载态并禁用批量按钮，完成后给结果", async () => {
      let resolveDelete: (() => void) | undefined;
      deletePortrait.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          }),
      );

      renderModal();
      enterSelectionMode();
      togglePortrait("立绘-B");

      fireEvent.click(selectionButton(/^删除/));
      const dialog = await screen.findByRole("dialog", {
        name: "批量删除立绘",
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "删除 1 张" }));

      // 加载态：进度条文案 + 批量按钮全部置灰（避免重复触发）
      const progress = await screen.findByText(/正在删除立绘 1\/1/);
      expect(progress).toBeInTheDocument();
      // 进度和操作条在同一个吸顶容器里：滚到列表深处也看得到处理进度
      const dock = document.querySelector<HTMLElement>(
        ".portrait-selection-dock",
      );
      expect(dock).not.toBeNull();
      expect(dock).toContainElement(progress);
      expect(selectionButton(/^删除/)).toBeDisabled();
      expect(selectionButton(/沿用默认立绘裁剪/)).toBeDisabled();

      // 放行删除请求，等结果提示
      await act(async () => {
        resolveDelete?.();
      });
      expect(
        await screen.findByText("已删除 1 张立绘。"),
      ).toBeInTheDocument();
    });

    it("取消确认时一张都不删，选中状态保留", async () => {
      renderModal();
      enterSelectionMode();
      togglePortrait("立绘-B");
      togglePortrait("立绘-C");

      fireEvent.click(selectionButton(/^删除/));
      const dialog = await screen.findByRole("dialog", {
        name: "批量删除立绘",
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "批量删除立绘" }),
        ).not.toBeInTheDocument(),
      );
      expect(deletePortrait).not.toHaveBeenCalled();
      expect(screen.getByText("已选 2 / 3 张")).toBeInTheDocument();
    });

    it("选中默认立绘时确认框多一段警告，删除后剩下的第一张成为默认立绘", async () => {
      const { container } = renderModal();
      enterSelectionMode();
      togglePortrait("立绘-默认");
      togglePortrait("立绘-B");

      fireEvent.click(selectionButton(/^删除/));
      const dialog = await screen.findByRole("dialog", {
        name: "批量删除立绘",
      });
      expect(
        within(dialog).getByText(/包含默认立绘/),
      ).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole("button", { name: "删除 2 张" }));

      await waitFor(() => expect(deletePortrait).toHaveBeenCalledTimes(2));
      expect(cardTitles(container)).toEqual(["立绘-C"]);
      expect(screen.getByText(/默认立绘已删除/)).toBeInTheDocument();
      // C 成为新的默认立绘：带上了角标（列表只剩它一张）
      expect(screen.getByText("默认立绘")).toBeInTheDocument();
      expect(screen.getByText("立绘-C")).toBeInTheDocument();
    });

    it("部分失败时提示失败项，只保留失败项选中并留在多选模式", async () => {
      deletePortrait.mockImplementation(
        async (_characterId: string, portraitId: string) => {
          if (portraitId === "c") {
            throw new Error("文件被占用");
          }
          return undefined;
        },
      );

      const { container } = renderModal();
      enterSelectionMode();
      togglePortrait("立绘-B");
      togglePortrait("立绘-C");

      fireEvent.click(selectionButton(/^删除/));
      const dialog = await screen.findByRole("dialog", {
        name: "批量删除立绘",
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "删除 2 张" }));

      expect(
        await screen.findByText(/1 张删除失败：立绘-C（删除失败：文件被占用）/),
      ).toBeInTheDocument();
      // B 删掉了，C 还在；列表与选中状态都只剩 C
      expect(cardTitles(container)).toEqual(["立绘-默认", "立绘-C"]);
      expect(selectionBar()).toBeInTheDocument();
      expect(screen.getByText("已选 1 / 2 张")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "选择立绘 立绘-C" }),
      ).toBeChecked();
    });
  });
});
