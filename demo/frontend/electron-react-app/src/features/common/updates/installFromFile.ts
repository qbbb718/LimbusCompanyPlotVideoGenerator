/**
 * 「用本地安装包更新」的统一入口 —— 拖进窗口、设置页选文件两条路都走这里。
 *
 * 主进程（public/update-service.js）负责校验：文件名必须是 `LCP<版本>.exe`、必须比当前版本新、
 * 必须与 latest.yml 里的 sha512 一致。这里负责**把它翻译成用户看得懂的一段话**并要一次确认：
 * 路径、版本、体积、校验结果三个信息缺一不可 —— 拖进来的 exe 是要被执行的，
 * 只说"要安装吗"等于让用户在看不见来源的情况下点确定。
 *
 * 校验值对不上时主进程会直接拒绝（`ok:false`），这里不再给"仍然安装"的口子：
 * 一个 sha512 与官方不一致的安装包，最可能的原因是下载损坏，其次就不是什么好东西了。
 */

/** 字节数转成好读的体积（1.2 GB / 275.7 MB） */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '未知大小';
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(2)} GB`;
  return `${megabytes.toFixed(1)} MB`;
}

/**
 * 把主进程返回的待确认信息整理成确认框里的文字。
 *
 * <p>单独抽出来是为了能直接断言内容：这段文字是用户决定"要不要执行这个 exe"的唯一依据，
 * 它不能悄悄漏掉校验结果（尤其是 unverified 这种情况）。
 */
export function buildInstallerConfirmText(info: InstallerConfirmInfo): string {
  const lines = [
    `将用本地安装包更新到 v${info.version}`,
    '',
    `文件：${info.fileName}（${formatSize(info.size)}）`,
    `位置：${info.filePath}`,
  ];

  if (info.status === 'match') {
    const from = info.sourceLabel ? `（来自 ${info.sourceLabel}）` : '';
    lines.push(`校验：与官方校验值一致${from}`);
  } else if (info.status === 'unverified') {
    lines.push('校验：⚠ 无法核对来源（离线或更新源连不上），只确认了文件名与体积');
    lines.push('      请只在你自己从官方渠道下载的安装包上继续。');
  } else {
    lines.push(
      `校验：✗ 与官方校验值不一致（官方 ${info.expectedShort || '?'}，本地 ${info.actualShort || '?'}）`,
    );
  }

  lines.push('');
  lines.push('安装会关闭当前应用；角色/背景/音频素材与工程数据都保留，装完会自动打开新版本。');
  lines.push('');
  lines.push('继续安装吗？');
  return lines.join('\n');
}

export type InstallFromFileOutcome = 'installed' | 'canceled' | 'failed';

/** 主进程 update:install-from-file 的最小依赖（单测里可以直接传假实现） */
export interface InstallFromFileApi {
  installUpdateFromFile: (
    filePath: string,
    options?: { confirmed?: boolean },
  ) => Promise<InstallFromFileResult>;
}

/**
 * 校验 → 确认 → 安装。
 *
 * @returns installed = 安装器已启动（应用马上会退出）；canceled = 用户点了取消；
 *          failed = 校验没过 / 启动失败（提示已经弹过）
 */
export async function promptAndInstallFromFile(
  api: InstallFromFileApi,
  filePath: string,
): Promise<InstallFromFileOutcome> {
  const first = await api.installUpdateFromFile(filePath);
  if (first.ok) return 'installed';
  if (!first.needConfirm || !first.info) {
    window.alert(first.error || '这个安装包不能用来更新');
    return 'failed';
  }

  const info = first.info;
  // 主进程在 needConfirm 之前已经拒绝过 mismatch；这里再拦一层，防的是将来改动改掉那个判断
  if (info.status === 'mismatch') {
    window.alert('安装包与官方校验值不一致，已拒绝安装。');
    return 'failed';
  }
  if (!window.confirm(buildInstallerConfirmText(info))) return 'canceled';

  const second = await api.installUpdateFromFile(filePath, { confirmed: true });
  if (!second.ok) {
    window.alert(second.error || '启动安装程序失败');
    return 'failed';
  }
  return 'installed';
}
