import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
// 本项目没有全局注册 jest-dom 匹配器，用到它的测试自行引入（与 VersionInfo.test.tsx 一致）
import "@testing-library/jest-dom";
import UpdateSection from "./UpdateSection";

/**
 * 设置页「软件更新」卡片：状态由主进程推/拉，组件只负责画出来。
 *
 * 这里验证的是"界面对每种 phase 都要给出可操作的下一步"：
 * 已是最新 / 发现新版本（带更新说明）/ 下载中（带进度）/ 已下载（能重启安装）/ 出错（有手动下载兜底）。
 * 真实下载与安装都在主进程（public/update-service.js），所以 IPC 一律用假实现。
 */

const idleState: UpdateState = {
  phase: "idle",
  currentVersion: "0.6.0",
  links: [],
};

/** 造一份假的 electronAPI；onUpdateStatus 把回调存起来，测试里可以直接"推"状态 */
function installFakeApi(initial: UpdateState) {
  let push: ((state: UpdateState) => void) | null = null;
  const api = {
    getUpdateState: jest.fn().mockResolvedValue(initial),
    checkForUpdates: jest.fn().mockResolvedValue({ ...initial, phase: "checking" }),
    downloadUpdate: jest.fn().mockResolvedValue({ ok: true }),
    installUpdate: jest.fn().mockResolvedValue({ ok: true, installing: true }),
    installUpdateFromFile: jest.fn().mockResolvedValue({ ok: false, needConfirm: true }),
    chooseUpdateInstaller: jest.fn().mockResolvedValue({ canceled: true }),
    openUpdateLink: jest.fn().mockResolvedValue({ ok: true }),
    onUpdateStatus: jest.fn((callback: (state: UpdateState) => void) => {
      push = callback;
      return () => {
        push = null;
      };
    }),
  };
  (window as any).electronAPI = api;
  return { api, push: (state: UpdateState) => push && push(state) };
}

describe("UpdateSection", () => {
  afterEach(() => {
    delete (window as any).electronAPI;
    jest.restoreAllMocks();
  });

  test("浏览器模式（没有 electronAPI）说明网页版没有自动更新", async () => {
    render(<UpdateSection />);
    await waitFor(() =>
      expect(screen.getByText(/网页版没有自动更新/)).toBeInTheDocument(),
    );
  });

  test("挂载时拉取当前状态；点「检查更新」调用 checkForUpdates", async () => {
    const { api } = installFakeApi(idleState);
    render(<UpdateSection />);

    await waitFor(() => expect(screen.getByText("0.6.0")).toBeInTheDocument());
    expect(api.getUpdateState).toHaveBeenCalledTimes(1);
    expect(screen.getByText("还没有检查过更新。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    await waitFor(() => expect(api.checkForUpdates).toHaveBeenCalledTimes(1));
  });

  test("发现新版本：显示版本号与更新说明，并能触发下载", async () => {
    const { api } = installFakeApi({
      phase: "available",
      currentVersion: "0.6.0",
      version: "0.6.1",
      sourceLabel: "加速通道 1",
      notes: "- 修好了导出卡在 0%\n- 新增情绪动画",
      links: [
        { label: "GitHub 发布页", url: "https://github.com/qbbb718/LimbusCompanyPlotVideoGenerator/releases/latest" },
      ],
    });
    render(<UpdateSection />);

    await waitFor(() =>
      expect(screen.getByText(/发现新版本 v0.6.1/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/来自 加速通道 1/)).toBeInTheDocument();
    expect(screen.getByText(/新增情绪动画/)).toBeInTheDocument();
    expect(screen.getByText("→ 最新 v0.6.1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /下载更新/ }));
    await waitFor(() => expect(api.downloadUpdate).toHaveBeenCalledTimes(1));
  });

  test("下载中显示进度百分比与体积", async () => {
    installFakeApi({
      phase: "downloading",
      currentVersion: "0.6.0",
      version: "0.6.1",
      percent: 42,
      transferred: 120 * 1024 * 1024,
      total: 280 * 1024 * 1024,
      bytesPerSecond: 2.5 * 1024 * 1024,
    });
    render(<UpdateSection />);

    await waitFor(() => expect(screen.getByText(/42\.0%/)).toBeInTheDocument());
    expect(screen.getByText(/120\.0 MB \/ 280\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5 MB\/s/)).toBeInTheDocument();
    // 下载中不允许重复点"检查更新"或换安装包，避免和正在下载的更新打架
    expect(screen.getByRole("button", { name: "检查更新" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /安装包更新/ })).toBeDisabled();
  });

  test("已下载：点「重启并安装」调用 installUpdate", async () => {
    const { api } = installFakeApi({
      phase: "downloaded",
      currentVersion: "0.6.0",
      version: "0.6.1",
    });
    render(<UpdateSection />);

    const button = await screen.findByRole("button", { name: /重启并安装 v0\.6\.1/ });
    fireEvent.click(button);
    await waitFor(() => expect(api.installUpdate).toHaveBeenCalledTimes(1));
  });

  test("出错：显示原因与手动下载链接（外链交给主进程打开）", async () => {
    const accelerationUrl =
      "https://gh-proxy.com/https://github.com/qbbb718/LimbusCompanyPlotVideoGenerator/releases/latest/download/LCP0.6.1.exe";
    const { api } = installFakeApi({
      phase: "error",
      currentVersion: "0.6.0",
      error: "连不上更新服务器",
      errorDetail: "所有更新源都超时或被拒绝",
      links: [
        { label: "GitHub 发布页", url: "https://github.com/qbbb718/LimbusCompanyPlotVideoGenerator/releases/latest" },
        { label: "加速通道 1下载", url: accelerationUrl },
      ],
    });
    render(<UpdateSection />);

    await waitFor(() =>
      expect(screen.getByText("连不上更新服务器")).toBeInTheDocument(),
    );
    expect(screen.getByText(/所有更新源都超时或被拒绝/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("加速通道 1下载"));
    await waitFor(() =>
      expect(api.openUpdateLink).toHaveBeenCalledWith(accelerationUrl),
    );
  });

  test("主进程推送的状态会覆盖挂载时拉到的旧值", async () => {
    const { push } = installFakeApi(idleState);
    render(<UpdateSection />);

    await waitFor(() => expect(screen.getByText("还没有检查过更新。")).toBeInTheDocument());

    // 模拟"窗口打开之后主进程才检查完"，状态经由 update:status 推过来
    act(() => {
      push({
        phase: "available",
        currentVersion: "0.6.0",
        version: "0.6.1",
        notes: "修复若干问题",
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/发现新版本 v0\.6\.1/)).toBeInTheDocument(),
    );
  });
});
