import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ApiService from "@services/ApiService";
import PortraitScenePreview from "./PortraitScenePreview";

jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: {
    getBackgrounds: jest.fn(),
    getPortraitPreview: jest.fn(),
  },
}));

const mockedApi = ApiService as unknown as {
  getBackgrounds: jest.Mock;
  getPortraitPreview: jest.Mock;
};

const BACKGROUNDS = [
  { uuid: "bg-1", name: "办公室", path: "/assets/backgrounds/office.png", tags: [] },
  { uuid: "bg-2", name: "走廊", path: "/assets/backgrounds/hall.png", tags: [] },
];

/**
 * 立绘场景预览弹窗：
 * - 打开后自动选第一张背景并请求渲染；
 * - 请求里必须带上当前裁剪参数、角色身高与所选背景；
 * - 切换背景后重新请求；
 * - 没有背景时给出可执行的提示，而不是渲染一张空图。
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
  });

  const renderPreview = (overrides: Partial<React.ComponentProps<typeof PortraitScenePreview>> = {}) =>
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
    const formData = mockedApi.getPortraitPreview.mock.calls[1][0] as FormData;
    expect(formData.get("backgroundId")).toBe("bg-2");
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

    expect(
      await screen.findByText(/没有可用的背景图/),
    ).toBeTruthy();
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
});
