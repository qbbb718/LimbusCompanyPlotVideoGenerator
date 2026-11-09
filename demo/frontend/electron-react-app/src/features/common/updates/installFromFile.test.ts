import { buildInstallerConfirmText, formatSize, promptAndInstallFromFile } from "./installFromFile";

/**
 * 「用本地安装包更新」的确认流程。
 *
 * 重点不是文案好不好看，而是：用户在看到"这是哪个文件、什么版本、校验结果如何"之前，
 * 绝不能有任何代码路径把这个 exe 跑起来。所以这里逐条钉住：
 * 校验不一致 → 拒绝；用户点取消 → 不装；只有 confirmed:true 那一次调用才会走到主进程的安装分支。
 */

const baseInfo: InstallerConfirmInfo = {
  filePath: "D:\\Downloads\\LCP0.6.1.exe",
  fileName: "LCP0.6.1.exe",
  version: "0.6.1",
  size: 280 * 1024 * 1024,
  status: "match",
  sourceLabel: "加速通道 1",
};

describe("formatSize", () => {
  test("MB / GB 与未知体积", () => {
    expect(formatSize(280 * 1024 * 1024)).toBe("280.0 MB");
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
    expect(formatSize(0)).toBe("未知大小");
    expect(formatSize(undefined)).toBe("未知大小");
  });
});

describe("buildInstallerConfirmText", () => {
  test("校验通过：给出文件、路径与来源", () => {
    const text = buildInstallerConfirmText(baseInfo);
    expect(text).toContain("更新到 v0.6.1");
    expect(text).toContain("LCP0.6.1.exe（280.0 MB）");
    expect(text).toContain("D:\\Downloads\\LCP0.6.1.exe");
    expect(text).toContain("与官方校验值一致（来自 加速通道 1）");
    expect(text).toContain("继续安装吗？");
  });

  test("拿不到官方校验值：必须明确写出来，不能假装校验过", () => {
    const text = buildInstallerConfirmText({ ...baseInfo, status: "unverified" });
    expect(text).toContain("无法核对来源");
    expect(text).not.toContain("与官方校验值一致");
  });

  test("校验不一致：把两边的摘要都摆出来", () => {
    const text = buildInstallerConfirmText({
      ...baseInfo,
      status: "mismatch",
      expectedShort: "AAAA1111",
      actualShort: "BBBB2222",
    });
    expect(text).toContain("与官方校验值不一致");
    expect(text).toContain("AAAA1111");
    expect(text).toContain("BBBB2222");
  });
});

describe("promptAndInstallFromFile", () => {
  const makeApi = (results: InstallFromFileResult[]) => {
    const calls: Array<{ filePath: string; options?: { confirmed?: boolean } }> = [];
    const api = {
      installUpdateFromFile: jest.fn(
        async (filePath: string, options?: { confirmed?: boolean }) => {
          calls.push({ filePath, options });
          return results[Math.min(calls.length - 1, results.length - 1)];
        },
      ),
    };
    return { api, calls };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("校验通过且用户确认：第二次调用带 confirmed:true，返回 installed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const { api, calls } = makeApi([
      { ok: false, needConfirm: true, info: baseInfo },
      { ok: true, installing: true, version: "0.6.1" },
    ]);

    await expect(promptAndInstallFromFile(api, baseInfo.filePath)).resolves.toBe("installed");
    expect(calls).toHaveLength(2);
    expect(calls[0].options).toBeUndefined();
    expect(calls[1].options).toEqual({ confirmed: true });
  });

  test("用户点取消：不发起安装", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const { api, calls } = makeApi([{ ok: false, needConfirm: true, info: baseInfo }]);

    await expect(promptAndInstallFromFile(api, baseInfo.filePath)).resolves.toBe("canceled");
    expect(calls).toHaveLength(1);
  });

  test("不是本软件的安装包：直接提示，不弹确认框", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const { api } = makeApi([{ ok: false, error: "这不是本软件的安装包（文件名应形如 LCP0.6.0.exe）" }]);

    await expect(promptAndInstallFromFile(api, "D:\\x\\setup.exe")).resolves.toBe("failed");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  test("sha512 不一致：拒绝安装，也不弹确认框", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const { api, calls } = makeApi([
      { ok: false, needConfirm: true, info: { ...baseInfo, status: "mismatch" } },
    ]);

    await expect(promptAndInstallFromFile(api, baseInfo.filePath)).resolves.toBe("failed");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("校验值不一致"));
    expect(calls).toHaveLength(1);
  });

  test("确认后启动安装器失败：把原因告诉用户", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const { api } = makeApi([
      { ok: false, needConfirm: true, info: baseInfo },
      { ok: false, error: "无法启动安装程序：EACCES" },
    ]);

    await expect(promptAndInstallFromFile(api, baseInfo.filePath)).resolves.toBe("failed");
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
  });
});
