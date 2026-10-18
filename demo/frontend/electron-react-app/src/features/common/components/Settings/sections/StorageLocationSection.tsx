import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ApiService from '@services/ApiService';
import '../Settings.css';

/**
 * 资源存储位置（数据根目录）。
 *
 * <p>素材、工程数据库、临时工程文件与日志默认都放在
 * `%APPDATA%\limbus-company-plot-video-generator`（C 盘），素材一多就会把系统盘塞满。
 * 这个分区让用户把它整体换到别的盘（例如 `D:\LBC-Data`）。
 *
 * <p>为什么换位置这么"重"：数据根目录决定了后端以哪个目录为工作目录、SQLite 库开在哪、
 * 素材从哪读，所以只能由主进程决定并在**启动后端时**传进去（`-Dlbc.data.dir`）。
 * 因此这里的流程是：选目录 → 选要不要把现有数据复制过去 → 写定位文件 → 重启应用。
 * 渲染进程没有文件系统权限，所有落盘动作都在主进程完成（见 `public/electron.js` 的
 * `data-location:*`）。
 *
 * <p>原位置的数据一律不删：复制是"增量复制"，切换后旧目录仍然完整，用户可以自己确认没问题
 * 再手动清理。这也是为什么"恢复默认位置"也提供复制选项——否则切回去会看到旧数据。
 */
const SUBDIR_LABELS: Record<string, string> = {
  assets: '素材（立绘/背景/音频/UI）',
  data: '工程数据库',
  projects: '临时工程文件',
  resources: '其它资源',
  logs: '日志',
};

/** 字节数转成好读的单位 */
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 待确认的动作：换位置，或恢复默认位置 */
interface PendingAction {
  kind: 'change' | 'reset';
  target: string;
  hasExistingLibrary: boolean;
  validation: { ok: boolean; error?: string; warnings?: string[] };
}

/** 用户对"数据怎么办"的选择 */
type PendingMode = 'copy' | 'blank' | 'adopt' | 'overwrite';

interface ModeOption {
  value: PendingMode;
  label: string;
}

const StorageLocationSection: React.FC = () => {
  const api: any =
    typeof window !== 'undefined' ? (window as any).electronAPI : null;
  const supported = !!(api && typeof api.getDataLocation === 'function');

  const [info, setInfo] = useState<DataLocationInfo | null>(null);
  /** 浏览器模式（npm start 直接开网页）拿不到主进程信息，只能显示后端自检出的素材目录 */
  const [fallback, setFallback] = useState<{ dataRoot: string; assetsDir: string } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [mode, setMode] = useState<PendingMode>('copy');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (supported) {
      try {
        const result = await api.getDataLocation();
        if (!result || !result.ok) {
          setError(`读取资源位置失败：${result?.error || '未知错误'}`);
          return;
        }
        setInfo(result as DataLocationInfo);
        return;
      } catch (e: any) {
        setError(`读取资源位置失败：${e?.message || e}`);
        return;
      }
    }
    // 浏览器模式：没有主进程，退化成读后端的自检接口（只能看、不能改）
    try {
      const diagnostics = await ApiService.getAssetDiagnostics();
      setFallback({
        dataRoot: diagnostics.dataRoot || '',
        assetsDir: diagnostics.assetsDir || '',
      });
    } catch (e: any) {
      setError(`读取素材目录失败：${e?.message || e}`);
    }
  }, [api, supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 迁移进度：主进程一边复制一边推，界面显示"正在复制 素材（1/5）"
  useEffect(() => {
    if (!api || typeof api.onDataLocationProgress !== 'function') return undefined;
    api.onDataLocationProgress((payload: DataLocationProgress | null) => {
      if (!payload) {
        setProgress('');
        return;
      }
      const label = SUBDIR_LABELS[payload.entry] || payload.entry;
      setProgress(`正在复制 ${label}（${payload.index}/${payload.total}）…`);
    });
    // 与菜单监听同一套约定：取消订阅走 removeAllListeners
    return () => {
      if (typeof api.removeAllListeners === 'function') {
        api.removeAllListeners('data-location:progress');
      }
    };
  }, [api]);

  const handleChoose = useCallback(async () => {
    if (!api) return;
    setError('');
    setMessage('');
    setPending(null);
    try {
      const result: DataLocationChoice = await api.chooseDataLocation();
      if (result?.canceled) return; // 用户取消，不是错误
      if (!result || !result.ok) {
        setError(result?.error || '选择位置失败');
        return;
      }
      setPending({
        kind: 'change',
        target: result.target || '',
        hasExistingLibrary: !!result.hasExistingLibrary,
        validation: result.validation || { ok: true },
      });
      // 目标里已有一份数据时，默认"直接用它"最安全；空目录时默认"把数据复制过去"
      setMode(result.hasExistingLibrary ? 'adopt' : 'copy');
    } catch (e: any) {
      setError(`选择位置失败：${e?.message || e}`);
    }
  }, [api]);

  const handleResetClick = useCallback(() => {
    if (!info) return;
    setError('');
    setMessage('');
    setPending({
      kind: 'reset',
      target: info.defaultDataRoot,
      hasExistingLibrary: false,
      validation: { ok: true },
    });
    setMode('copy');
  }, [info]);

  const handleOpen = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.openDataLocation();
      if (!result?.success) {
        setError(`打开资源目录失败：${result?.error || '未知错误'}`);
      }
    } catch (e: any) {
      setError(`打开资源目录失败：${e?.message || e}`);
    }
  }, [api]);

  /** 打开任意目录（这里用来打开"迁移之前的旧位置"，方便用户自己清理） */
  const handleOpenPath = useCallback(
    async (folderPath: string) => {
      if (!api || !folderPath) return;
      if (typeof api.openFolder !== 'function') {
        setError(`当前版本不支持打开文件夹，请手动打开：${folderPath}`);
        return;
      }
      try {
        const result = await api.openFolder(folderPath);
        if (!result?.success) {
          setError(`打开文件夹失败：${result?.error || '未知错误'}`);
        }
      } catch (e: any) {
        setError(`打开文件夹失败：${e?.message || e}`);
      }
    },
    [api],
  );

  const handleRestart = useCallback(async () => {
    if (!api) return;
    try {
      await api.relaunchApp();
    } catch (e: any) {
      setError(`重启失败：${e?.message || e}`);
    }
  }, [api]);

  const handleConfirm = useCallback(async () => {
    if (!pending || !api) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let result: DataLocationChangeResult;
      if (pending.kind === 'reset') {
        result = await api.resetDataLocation({ migrate: mode === 'copy' });
      } else {
        result = await api.applyDataLocation(pending.target, {
          migrate: mode === 'copy' || mode === 'overwrite',
          overwrite: mode === 'overwrite',
        });
      }

      if (!result || !result.ok) {
        setError(result?.error || '切换失败');
        return;
      }

      const copied = result.migration?.copied || [];
      const notes = result.warnings || [];
      const head =
        pending.kind === 'reset'
          ? `已恢复默认位置：${result.target || pending.target}`
          : `资源位置已切换为：${result.target || pending.target}`;
      const copyLine = copied.length
        ? `\n已复制：${copied.map((name) => SUBDIR_LABELS[name] || name).join('、')}`
        : '\n没有复制数据（新位置使用它自己已有的数据）。';
      const tail = result.restarting
        ? '\n正在重启应用…'
        : '\n重启应用后生效；原位置的数据没有被删除，确认新位置一切正常后可以自己清理。';
      const warnLine = notes.length ? `\n注意：${notes.join(' ')}` : '';
      setMessage(`${head}${copyLine}${tail}${warnLine}`);
      setPending(null);
      await refresh();
    } catch (e: any) {
      setError(`切换失败：${e?.message || e}`);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [api, mode, pending, refresh]);

  const modeOptions = useMemo<ModeOption[]>(() => {
    if (!pending) return [];
    const size = formatSize(info?.totalBytes);
    if (pending.kind === 'reset') {
      return [
        {
          value: 'copy',
          label: `先把当前数据复制回默认位置（约 ${size}；会覆盖默认位置里的同名文件，推荐）`,
        },
        {
          value: 'blank',
          label: '不复制，直接回到默认位置（默认位置里原有的旧数据会被使用）',
        },
      ];
    }
    if (pending.hasExistingLibrary) {
      return [
        { value: 'adopt', label: '直接使用该文件夹里已有的数据（当前的素材与工程留在原位置）' },
        { value: 'overwrite', label: '用当前的素材与工程数据覆盖该文件夹' },
      ];
    }
    return [
      { value: 'copy', label: `把当前的素材与工程数据复制过去（约 ${size}，推荐）` },
      { value: 'blank', label: '不复制，新位置从空白开始（相当于换一套新数据）' },
    ];
  }, [info?.totalBytes, pending]);

  // 浏览器模式：只能看素材目录，改不了（改位置必须有主进程参与）
  if (!supported) {
    return (
      <div className="settings-section">
        <h3>资源存储位置</h3>
        <div className="settings-section-content">
          <p className="settings-hint">
            素材、工程数据与日志都保存在一个"数据根目录"里。桌面版可以把它整体换到别的盘
            （例如 D 盘），避免占满系统盘；当前运行在浏览器中，没有主进程，只能在桌面版里修改。
          </p>
          {fallback?.dataRoot && (
            <p className="settings-hint">数据根目录：{fallback.dataRoot}</p>
          )}
          {fallback?.assetsDir && (
            <p className="settings-hint">素材目录：{fallback.assetsDir}</p>
          )}
          {error && <p className="settings-warning">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3>资源存储位置</h3>
      <div className="settings-section-content">
        <p className="settings-hint">
          素材（立绘/背景/音频/UI）、工程数据库、临时工程文件与日志都放在下面这个"数据根目录"里。
          素材会越攒越大，如果系统盘（C 盘）空间紧张，可以把整个目录换到别的盘，
          换位置时可以选择把现有数据一起复制过去。
        </p>

        {/* 主进程要先扫一遍目录统计占用，素材特别多时要等一下 */}
        {!info && !error && <p className="settings-hint">正在读取资源位置…</p>}

        {info && (
          <>
            <p className="settings-hint">
              当前数据根目录（来源：{info.sourceLabel}）：
            </p>
            <p className="storage-path">{info.dataRoot}</p>
            {info.isCustom && (
              <p className="settings-hint">定位文件：{info.configFile}</p>
            )}
            {info.locked && (
              <p className="settings-warning">
                当前位置由{info.sourceLabel}指定，优先级高于设置页，这里的"更改位置"不会生效。
                想改回去，需要去掉那个启动参数或环境变量。
              </p>
            )}
            {info.configError && (
              <p className="settings-warning">
                定位文件读取失败，已按默认位置处理：{info.configError}
              </p>
            )}
            {info.logDirFallback && (
              <p className="settings-warning">{info.logDirFallback}</p>
            )}

            <p className="settings-hint">
              已占用约 {formatSize(info.totalBytes)}
              {info.totalFiles > 0 ? `（${info.totalFiles} 个文件）` : ''}：
            </p>
            <ul className="storage-entry-list">
              {(info.entries || []).map((entry) => (
                <li key={entry.name}>
                  {SUBDIR_LABELS[entry.name] || entry.name}：
                  {entry.exists
                    ? `${formatSize(entry.bytes)}（${entry.files} 个文件${entry.truncated ? '，统计已截断' : ''}）`
                    : '还没有'}
                </li>
              ))}
            </ul>

            {info.needsRestart && (
              <p className="settings-warning">
                已改为 {info.pendingDataRoot || '新位置'}，重启应用后生效。
              </p>
            )}

            {/* 切到别的盘通常就是为了给 C 盘腾空间：明确告诉用户旧目录还在，可以自己删 */}
            {!info.needsRestart && info.isCustom && info.previousDataRoot && (
              <>
                <p className="settings-hint">
                  上次是从 {info.previousDataRoot} 迁移过来的。旧位置里还留着一整份数据，
                  确认新位置一切正常后，可以手动删掉那个文件夹来腾出空间
                  （删之前建议先确认工程、素材、导出都正常）。
                </p>
                <div className="storage-actions">
                  <button
                    className="reset-button"
                    onClick={() => handleOpenPath(info.previousDataRoot)}
                    disabled={busy}
                  >
                    打开旧位置
                  </button>
                </div>
              </>
            )}

            <div className="storage-actions">
              <button
                className="save-button"
                onClick={handleChoose}
                disabled={busy || info.locked || info.needsRestart}
              >
                更改位置…
              </button>
              {info.isCustom && (
                <button
                  className="reset-button"
                  onClick={handleResetClick}
                  disabled={busy || info.needsRestart}
                >
                  恢复默认位置
                </button>
              )}
              <button className="reset-button" onClick={handleOpen} disabled={busy}>
                打开文件夹
              </button>
              {info.needsRestart && (
                <button className="save-button" onClick={handleRestart} disabled={busy}>
                  立即重启
                </button>
              )}
            </div>
          </>
        )}

        {pending && (
          <div className="storage-pending">
            <p className="settings-hint">
              {pending.kind === 'reset' ? '准备恢复到默认位置：' : '准备切换到：'}
            </p>
            <p className="storage-path">{pending.target}</p>

            {!pending.validation.ok && (
              <p className="settings-warning">
                这个位置不能用：{pending.validation.error}
              </p>
            )}
            {(pending.validation.warnings || []).map((warning) => (
              <p className="settings-warning" key={warning}>
                {warning}
              </p>
            ))}

            {pending.validation.ok && (
              <div className="storage-mode-list">
                {modeOptions.map((option) => (
                  <label key={option.value} className="storage-mode-item">
                    <input
                      type="radio"
                      name="storage-mode"
                      value={option.value}
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                      disabled={busy}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="storage-actions">
              <button
                className="save-button"
                onClick={handleConfirm}
                disabled={busy || !pending.validation.ok}
              >
                {busy
                  ? '处理中…'
                  : pending.kind === 'reset'
                    ? '确认恢复'
                    : '确认切换'}
              </button>
              <button
                className="reset-button"
                onClick={() => setPending(null)}
                disabled={busy}
              >
                取消
              </button>
            </div>
            {progress && <p className="settings-hint">{progress}</p>}
          </div>
        )}

        {message && <p className="log-export-result">{message}</p>}
        {error && <p className="settings-warning">{error}</p>}
      </div>
    </div>
  );
};

export default StorageLocationSection;
