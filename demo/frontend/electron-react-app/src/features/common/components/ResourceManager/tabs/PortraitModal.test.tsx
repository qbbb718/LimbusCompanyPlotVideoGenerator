/**
 * 「编辑立绘」弹窗的标题栏：保存 / 取消常驻在顶部。
 *
 * <p>裁剪画布有 500px 高，按钮原先在弹窗最底部 —— 窗口一小就得先把弹窗滚到底才点得到，
 * 而且滚下去之后标题也看不见了。改成和「角色编辑」弹窗一致：标题栏固定、
 * 内容区（裁剪画布 + 设置面板）自己滚（样式见 CharacterModal.css 的 `.portrait-modal`）。
 *
 * <p>这里钉住三件事：两个按钮确实在标题栏里、底部按钮行已经删掉、
 * 点下去的行为和搬之前一样（取消关弹窗 / 保存把立绘交回去）。
 */
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { Portrait } from "@types";
import PortraitModal from "./PortraitModal";

// 真裁剪器要量 DOM 尺寸、还要画 canvas，jsdom 里没意义：这里只看弹窗外壳
jest.mock("react-advanced-cropper", () => ({
  __esModule: true,
  Cropper: () => null,
}));

const portrait: Portrait = {
  portraitID: "portrait_1",
  characterID: "char_1",
  imagePath: "char_1/portrait_1.png",
  portName: "罗佳-face_happy_L",
  emotion: "HAPPY" as Portrait["emotion"],
  faceX: 120,
  faceY: 40,
  length: 300,
  adjX: 0,
  adjY: 0,
  thumbnailPath: "",
};

const renderModal = (
  overrides: Partial<React.ComponentProps<typeof PortraitModal>> = {},
) => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const view = render(
    <PortraitModal
      characterId="char_1"
      portrait={portrait}
      isNewPortrait={false}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { ...view, onSave, onClose };
};

describe("编辑立绘弹窗-标题栏", () => {
  test("保存 / 取消在标题栏里，底部按钮行已经删掉", () => {
    const { container } = renderModal();

    const header = container.querySelector(".modal-header") as HTMLElement;
    expect(header).toBeTruthy();
    expect(
      within(header).getByRole("button", { name: "保存" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "取消" }),
    ).toBeInTheDocument();

    // 底部那行按钮整行删掉，弹窗里不该再有 .modal-footer
    expect(container.querySelector(".modal-footer")).toBeNull();
    // 标题栏不滚动 → 裁剪画布和设置面板放在 .modal-body 里滚
    expect(container.querySelector(".portrait-modal > .modal-body")).toBeTruthy();
    expect(container.querySelector(".modal-body .portrait-editor")).toBeTruthy();
  });

  test("新立绘还没选文件时，保存按钮是灰的", () => {
    renderModal({ portrait: null, isNewPortrait: true });

    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("title", "请先选择立绘文件");
  });

  test("点取消关闭弹窗，不触发保存", () => {
    const { onSave, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("点保存把当前立绘交回去（情绪归一化成后端 code）", async () => {
    const { onSave, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      portraitID: "portrait_1",
      emotion: "happy",
      faceX: 120,
      faceY: 40,
      length: 300,
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
