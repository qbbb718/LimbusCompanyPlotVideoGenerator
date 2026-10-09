import React, { useCallback, useState } from 'react';
import '../Settings.css';

/** 字节数转成好读的单位（日志单文件几十 KB，用不上 GB 以上） */
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 报告时间用本地时间，和用户 Windows 里的时间一致 */
function formatNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 日志导出。
 *
 * <p>用户报错时最需要的就是日志文件，但安装版的日志藏在
 * `%APPDATA%\limbus-company-plot-video-generator\logs` 里，让普通用户自己去翻不现实。
 * 这里给一个按钮：主进程把日志目录里最新的若干条日志打成 zip，然后弹保存窗口让用户选位置，
 * 用户把压缩包发过来即可。
 *
 * <p>打包和保存都在主进程完成（见 `public/electron.js` 的 `logs:export`）：
 * 渲染进程没有文件系统权限，也不该知道日志目录的绝对路径。
 */
const LogExportSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 网页模式（非 Electron）没有主进程，导出能力不存在，直接隐藏按钮而不是点了才报错
  const canExport = typeof window !== 'undefined' && !!window.electronAPI?.exportLogs;

  const handleExport = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await window.electronAPI.exportLogs();
      if (result?.canceled) {
        // 用户主动取消，不是错误，不提示
        return;
      }
      if (!result?.ok) {
        setError(`获取日志失败：${result?.error || '未知错误'}`);
        return;
      }
      setMessage(
        `已导出 ${result.fileCount ?? 0} 个日志文件（压缩后 ${formatSize(result.zipSize)}）到：${result.filePath}\n` +
          `请把这个压缩包发给开发者，并说明遇到的问题。导出时间：${formatNow()}`,
      );
      if (result.skipped && result.skipped.length > 0) {
        setError(`有 ${result.skipped.length} 个日志文件被跳过：${result.skipped.map((s) => s.name).join('、')}`);
      }
    } catch (e: any) {
      setError(`获取日志失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="settings-section">
      <h3>日志与反馈</h3>
      <div className="settings-section-content">
        <p className="settings-hint">
          遇到报错、卡住或导出视频失败时，点下面的按钮把最近的日志打包导出，再把这个压缩包发给开发者，
          可以大幅加快定位问题的速度（压缩包里是日志目录中最新的 10 个文件）。
        </p>
        {canExport ? (
          <button className="save-button" onClick={handleExport} disabled={busy}>
            {busy ? '正在打包…' : '获取日志'}
          </button>
        ) : (
          <p className="settings-hint">当前运行在浏览器中，获取日志功能只在桌面版应用中可用。</p>
        )}
        {message && <p className="log-export-result">{message}</p>}
        {error && <p className="settings-warning">{error}</p>}
      </div>
    </div>
  );
};

export default LogExportSection;
