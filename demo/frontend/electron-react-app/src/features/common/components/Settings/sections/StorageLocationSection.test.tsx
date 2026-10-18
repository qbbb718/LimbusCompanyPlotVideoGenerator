import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// 本项目没有 src/setupTests.ts（jest-dom 匹配器未全局注册），所以在用到它的测试文件里自行引入
import "@testing-library/jest-dom";
import StorageLocationSection from "./StorageLocationSection";
import ApiService from "@services/ApiService";

jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: { getAssetDiagnostics: jest.fn() },
}));

/**
 * 设置页「资源存储位置」。
 *
 * 这里锁住的是几件容易回归的事：
 *   1. 默认/自定义/环境变量三种来源都要如实显示，被环境变量锁定时不能让人以为还能改；
 *   2. 换位置必须走"选目录 → 选数据怎么办 → 确认"三步，确认时要把选择如实传给主进程
 *      （migrate/overwrite 传错就等于把用户的素材库换丢了）；
 *   3. 浏览器模式（没有主进程）只能看不能改，不能崩。
 *
 * 真正搬文件的逻辑在主进程（public/electron.js），这里只验证渲染进程这一侧。
 */
const buildInfo = (
  overrides: Partial<DataLocationInfo> = {},
): DataLocationInfo & { ok: boolean } => ({
  ok: true,
  dataRoot: "D:\\LBC-Data",
  defaultDataRoot: "C:\\Users\\tester\\AppData\\Roaming\\limbus-company-plot-video-generator",
  configFile:
    "C:\\Users\\tester\\AppData\\Roaming\\limbus-company-plot-video-generator\\data-location.json",
  source: "config",
  sourceLabel: "设置页自定义",
  isCustom: true,
  locked: false,
  configError: "",
  logDirFallback: "",
  assetsDir: "D:\\LBC-Data\\assets",
  logsDir: "D:\\LBC-Data\\logs",
  pendingDataRoot: "",
  needsRestart: false,
  previousDataRoot: "",
  entries: [
    {
      name: "assets",
      path: "D:\\LBC-Data\\assets",
      exists: true,
      files: 12,
      bytes: 2048,
      truncated: false,
    },
    {
      name: "data",
      path: "D:\\LBC-Data\\data",
      exists: true,
      files: 1,
      bytes: 4096,
      truncated: false,
    },
  ],
  totalFiles: 13,
  totalBytes: 6144,
  ...overrides,
});

describe("StorageLocationSection", () => {
  afterEach(() => {
    delete (window as any).electronAPI;
    jest.resetAllMocks();
  });

  test("显示当前数据根目录、来源与各子目录占用", async () => {
    (window as any).electronAPI = {
      getDataLocation: jest.fn().mockResolvedValue(buildInfo()),
    };

    render(<StorageLocationSection />);

    await waitFor(() =>
      expect(screen.getByText("D:\\LBC-Data")).toBeInTheDocument(),
    );
    expect(screen.getByText(/来源：设置页自定义/)).toBeInTheDocument();
    // 「工程数据库：」只在占用列表里出现（说明文字里是「工程数据库、」，没有冒号）
    expect(screen.getByText(/工程数据库：/)).toBeInTheDocument();
    // 自定义位置才能"恢复默认位置"
    expect(
      screen.getByRole("button", { name: "恢复默认位置" }),
    ).toBeInTheDocument();
  });

  test("迁移过来时提示旧位置可以手动清理，并能打开它", async () => {
    const oldRoot =
      "C:\\Users\\tester\\AppData\\Roaming\\limbus-company-plot-video-generator";
    const openFolder = jest.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      getDataLocation: jest
        .fn()
        .mockResolvedValue(buildInfo({ previousDataRoot: oldRoot })),
      openFolder,
    };

    render(<StorageLocationSection />);

    expect(await screen.findByText(/还留着一整份数据/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开旧位置" }));

    await waitFor(() => expect(openFolder).toHaveBeenCalledWith(oldRoot));
  });

  test("默认位置时不显示「恢复默认位置」", async () => {    (window as any).electronAPI = {
      getDataLocation: jest.fn().mockResolvedValue(
        buildInfo({
          source: "default",
          sourceLabel: "默认位置",
          isCustom: false,
          dataRoot: "C:\\Users\\tester\\AppData\\Roaming\\limbus-company-plot-video-generator",
        }),
      ),
    };

    render(<StorageLocationSection />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "更改位置…" })).toBeEnabled(),
    );
    expect(
      screen.queryByRole("button", { name: "恢复默认位置" }),
    ).not.toBeInTheDocument();
  });

  test("被环境变量指定时禁用更改并说明原因", async () => {
    (window as any).electronAPI = {
      getDataLocation: jest.fn().mockResolvedValue(
        buildInfo({
          source: "env",
          sourceLabel: "环境变量 LBC_DATA_DIR",
          isCustom: false,
          locked: true,
        }),
      ),
    };

    render(<StorageLocationSection />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "更改位置…" })).toBeDisabled(),
    );
    expect(screen.getByText(/优先级高于设置页/)).toBeInTheDocument();
  });

  test("选好新位置后按「复制数据」确认：migrate=true 传给主进程", async () => {
    const applyDataLocation = jest.fn().mockResolvedValue({
      ok: true,
      target: "D:\\New\\LBC",
      migration: {
        copied: ["assets", "data", "projects", "resources", "logs"],
        skipped: [],
        failed: [],
        warnings: [],
      },
      needsRestart: true,
      restarting: false,
    });
    (window as any).electronAPI = {
      getDataLocation: jest.fn().mockResolvedValue(
        buildInfo({ source: "default", sourceLabel: "默认位置", isCustom: false }),
      ),
      chooseDataLocation: jest.fn().mockResolvedValue({
        canceled: false,
        ok: true,
        target: "D:\\New\\LBC",
        validation: { ok: true, warnings: [] },
        hasExistingLibrary: false,
      }),
      applyDataLocation,
    };

    render(<StorageLocationSection />);

    fireEvent.click(await screen.findByRole("button", { name: "更改位置…" }));
    fireEvent.click(await screen.findByText("确认切换"));

    await waitFor(() =>
      expect(applyDataLocation).toHaveBeenCalledWith("D:\\New\\LBC", {
        migrate: true,
        overwrite: false,
      }),
    );
  });

  test("目标目录已有数据时默认「直接使用」，确认时 migrate=false", async () => {
    const applyDataLocation = jest.fn().mockResolvedValue({
      ok: true,
      target: "D:\\Old\\LBC",
      needsRestart: true,
      restarting: false,
    });
    (window as any).electronAPI = {
      getDataLocation: jest.fn().mockResolvedValue(
        buildInfo({ source: "default", sourceLabel: "默认位置", isCustom: false }),
      ),
      chooseDataLocation: jest.fn().mockResolvedValue({
        canceled: false,
        ok: true,
        target: "D:\\Old\\LBC",
        validation: { ok: true, warnings: [] },
        hasExistingLibrary: true,
      }),
      applyDataLocation,
    };

    render(<StorageLocationSection />);

    fireEvent.click(await screen.findByRole("button", { name: "更改位置…" }));
    const adoptOption = await screen.findByLabelText(/直接使用该文件夹里已有的数据/);
    expect(adoptOption).toBeChecked();
    fireEvent.click(screen.getByText("确认切换"));

    await waitFor(() =>
      expect(applyDataLocation).toHaveBeenCalledWith("D:\\Old\\LBC", {
        migrate: false,
        overwrite: false,
      }),
    );
  });

  test("浏览器模式（没有主进程）只提示、不崩，并显示后端自检出的数据根目录", async () => {
    (ApiService.getAssetDiagnostics as jest.Mock).mockResolvedValue({
      dataRoot: "E:\\旧数据",
      assetsDir: "E:\\旧数据\\assets",
    });

    render(<StorageLocationSection />);

    await waitFor(() =>
      expect(screen.getByText(/只能在桌面版里修改/)).toBeInTheDocument(),
    );
    // 后端自检接口是异步的，等它回来再断言（否则会读到还没填上的 fallback）
    expect(await screen.findByText(/数据根目录：E:\\旧数据/)).toBeInTheDocument();
  });
});
