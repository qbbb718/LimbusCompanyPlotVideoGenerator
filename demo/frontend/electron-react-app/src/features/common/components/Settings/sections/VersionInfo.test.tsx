import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
// 本项目没有 src/setupTests.ts（jest-dom 匹配器未全局注册），所以在用到它的测试文件里自行引入，
// 不去改动其它测试的全局环境。
import "@testing-library/jest-dom";
import VersionInfo from "./VersionInfo";

/**
 * 设置页「关于 → 版本」的取值路径：渲染进程经 IPC 向主进程要 `app.getVersion()`。
 * 这里只验证「拿到版本就显示、拿不到就退化、不该出现硬编码」这三件事，
 * 真实版本号来自 package.json，由 scripts/version.mjs 统一维护。
 */
describe("VersionInfo", () => {
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  test("显示主进程返回的版本号", async () => {
    (window as any).electronAPI = {
      getAppVersion: jest.fn().mockResolvedValue("9.9.9"),
    };

    render(<VersionInfo />);

    await waitFor(() => expect(screen.getByText("9.9.9")).toBeInTheDocument());
    expect(window.electronAPI.getAppVersion).toHaveBeenCalledTimes(1);
  });

  test("浏览器模式（没有 electronAPI）显示网页版而不是瞎猜版本", async () => {
    render(<VersionInfo />);

    await waitFor(() => expect(screen.getByText("网页版")).toBeInTheDocument());
  });

  test("IPC 失败时退化显示未知，不抛异常", async () => {
    (window as any).electronAPI = {
      getAppVersion: jest.fn().mockRejectedValue(new Error("boom")),
    };

    render(<VersionInfo />);

    await waitFor(() => expect(screen.getByText("未知")).toBeInTheDocument());
  });
});
