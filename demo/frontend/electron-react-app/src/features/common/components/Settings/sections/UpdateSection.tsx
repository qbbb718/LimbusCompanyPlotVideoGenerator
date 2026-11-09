import React, { useCallback, useEffect, useState } from 'react';
import '../Settings.css';
import {
  formatSize,
  promptAndInstallFromFile,
} from '../../../updates/installFromFile';

/**
 * 设置页「关于 → 软件更新」。
 *
 * <p>所有更新状态都来自主进程（`public/update-service.js`）：挂载时 `getUpdateState()` 拉一次，
 * 之后订阅 `update:status`。这个组件只做两件事——把状态画成一句话 + 把用户的选择传回主进程。
 * 自己判断版本、自己拼下载地址都是错的：那样界面说的版本可能和安装器实际装的不是一回事。
 *
 * <p>为什么发现新版本不直接下载：安装包 ~280MB，用户有权先知道"新版本改了什么"。
 * 四个动作正好对应四条 IPC：检查 / 下载 / 重启安装 / 用本地安装包安装。
 *
 * <p>更新源是"GitHub + 加速前缀"，两边都连不上时不能只显示"检查失败"了事——
 * 这里会把主进程给的发布页与加速直链摆出来，用户至少还有手动下载这条路。
 */

/** 把状态翻成一句人话（自动检查出错时不打扰用户，只安静地写在卡片里） */
function statusTextOf(state: UpdateState | null): string {
  if (!state) return '正在读取更新状态…';
  switch (state.phase) {
    case 'idle':
      return '还没有检查过更新。';
    case 'checking':
      return '正在检查更新…（依次尝试 GitHub 与加速通道）';
    case 'up-to-date':
      return '已经是最新版本。';
    case 'available':
      return `发现新版本 v${state.version}${state.sourceLabel ? `（来自 ${state.sourceLabel}）` : ''}`;
    case 'downloading':
      return `正在下载 v${state.version}…`;
    case 'downloaded':
      return `v${state.version} 已下载完成，重启应用即可完成安装。`;
    case 'installing':
      return '正在安装，应用会关闭并自动重新打开…';
    case 'error':
      return state.error || '检查更新失败。';
    case 'unsupported':
      return '这个版本没有打包更新组件，请到 GitHub 发布页手动下载安装包。';
    default:
      return '';
  }
}

/** 下载速度（B/s → MB/s） */
function formatSpeed(bytesPerSecond?: number): string {
  const value = Number(bytesPerSecond) || 0;
  if (value <= 0) return '—';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB/s`;
  return `${Math.round(value / 1024)} KB/s`;
}

function formatCheckedAt(checkedAt?: number): string {
  if (!checkedAt) return '';
  try {
    return new Date(checkedAt).toLocaleTimeString();
  } catch (err) {
    return '';
  }
}

const UpdateSection: React.FC = () => {
  const api: any =
    typeof window !== 'undefined' ? (window as any).electronAPI : null;
  const supported = !!(api && typeof api.getUpdateState === 'function');

  const [state, setState] = useState<UpdateState | null>(null);
  /** 选安装包 / 确认安装这段是渲染进程自己走完的，需要防重复点击 */
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    api
      .getUpdateState()
      .then((value: UpdateState) => {
        if (!cancelled) setState(value);
      })
      .catch((err: Error) => console.warn('读取更新状态失败:', err));
    // 订阅是"拉一次 + 推很多次"里的后半段：拉一次拿到当前值，推过来的后续变化覆盖它
    const unsubscribe = api.onUpdateStatus((value: UpdateState) => setState(value));
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
    // api / supported 来自 window，生命周期内不会变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const handleCheck = useCallback(() => {
    if (!supported) return;
    api.checkForUpdates().catch((err: Error) => console.warn('检查更新失败:', err));
  }, [api, supported]);

  const handleDownload = useCallback(() => {
    if (!supported) return;
    api.downloadUpdate().catch((err: Error) => console.warn('下载更新失败:', err));
  }, [api, supported]);

  const handleInstall = useCallback(() => {
    if (!supported) return;
    api.installUpdate().catch((err: Error) => console.warn('安装更新失败:', err));
  }, [api, supported]);

  const handleChooseInstaller = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const picked = await api.chooseUpdateInstaller();
      if (!picked || picked.canceled || !picked.filePath) return;
      await promptAndInstallFromFile(api, picked.filePath);
      // 装成功的话应用马上就退出了；失败/取消的情况上面已经提示过
    } catch (err) {
      console.warn('用安装包更新失败:', err);
      window.alert(`用安装包更新失败：${(err as Error).message || err}`);
    } finally {
      setBusy(false);
    }
  }, [api, busy, supported]);

  const handleOpenLink = useCallback(
    (url: string) => {
      if (!supported) return;
      api.openUpdateLink(url).catch((err: Error) => console.warn('打开链接失败:', err));
    },
    [api, supported],
  );

  if (!supported) {
    return (
      <div className="settings-section update-section">
        <h3>软件更新</h3>
        <div className="settings-section-content">
          <p className="settings-hint">
            网页版没有自动更新；安装版启动后会自动检查新版本。
          </p>
          <p className="settings-hint">
            手动更新：到 GitHub 发布页下载最新安装包，覆盖安装到同一目录即可，
            角色 / 背景 / 音频素材与工程数据都会保留。
          </p>
        </div>
      </div>
    );
  }

  const phase = state?.phase ?? 'idle';
  const percent = Math.min(100, Math.max(0, Number(state?.percent) || 0));
  const notes = (state?.notes || '').trim();
  const links = state?.links || [];
  const canCheck = phase !== 'checking' && phase !== 'downloading' && phase !== 'installing';
  const canUseLocalInstaller =
    !busy && (phase === 'idle' || phase === 'up-to-date' || phase === 'error' || phase === 'available');
  const checkedAt = formatCheckedAt(state?.checkedAt);

  return (
    <div className="settings-section update-section">
      <h3>软件更新</h3>
      <div className="settings-section-content">
        <p className="update-version-line">
          当前版本 <strong>{state?.currentVersion || '—'}</strong>
          {phase === 'available' && state?.version ? (
            <span className="update-new-version"> → 最新 v{state.version}</span>
          ) : null}
          {checkedAt ? <span className="update-checked-at">（上次检查 {checkedAt}）</span> : null}
        </p>

        <p className="update-status" data-phase={phase}>
          {statusTextOf(state)}
        </p>

        {phase === 'downloading' ? (
          <div className="update-progress">
            <div className="update-progress-bar">
              <div className="update-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="update-progress-text">
              {percent.toFixed(1)}% · {formatSize(state?.transferred)} / {formatSize(state?.total)} ·{' '}
              {formatSpeed(state?.bytesPerSecond)}
            </p>
          </div>
        ) : null}

        {notes && (phase === 'available' || phase === 'downloaded') ? (
          <details className="update-notes" open>
            <summary>更新内容（v{state?.version}）</summary>
            <pre className="update-notes-body">{notes}</pre>
          </details>
        ) : null}

        {phase === 'error' ? (
          <div className="update-error">
            {state?.errorDetail ? (
              <p className="update-detail">详情：{state.errorDetail}</p>
            ) : null}
            {links.length > 0 ? (
              <p className="update-links">
                手动下载：
                {links.map((link) => (
                  <button
                    key={link.url}
                    type="button"
                    className="about-link update-link"
                    onClick={() => handleOpenLink(link.url)}
                  >
                    {link.label}
                  </button>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="update-actions">
          {phase === 'available' ? (
            <button type="button" className="save-button" onClick={handleDownload}>
              下载更新（约 280 MB）
            </button>
          ) : null}
          {phase === 'downloaded' ? (
            <button type="button" className="save-button" onClick={handleInstall}>
              重启并安装 v{state?.version}
            </button>
          ) : null}
          <button
            type="button"
            className="reset-button"
            onClick={handleCheck}
            disabled={!canCheck}
          >
            {phase === 'checking' ? '正在检查…' : '检查更新'}
          </button>
          <button
            type="button"
            className="reset-button"
            onClick={handleChooseInstaller}
            disabled={!canUseLocalInstaller}
          >
            {busy ? '正在校验安装包…' : '用已下载的安装包更新'}
          </button>
        </div>

        <p className="settings-hint update-hint">
          打不开 GitHub 时，加速通道会自动顶上；也可以把安装包（形如 LCP0.6.0.exe）
          <strong>直接拖进窗口</strong>，校验通过后一步装好。
        </p>
      </div>
    </div>
  );
};

export default UpdateSection;
