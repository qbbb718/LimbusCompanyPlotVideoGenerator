import React, { useCallback, useEffect, useState } from 'react';
import ApiService from '@services/ApiService';
import '../Settings.css';

/**
 * 素材自检与修复。
 *
 * <p>安装版会把随包发布的 assets/ 复制到用户数据目录，但那次复制只在"目标目录不存在"时执行一次：
 * 复制被打断（杀软拦截、磁盘写满、强退）或从旧版本升级上来时，assets/ui、assets/effects 这些
 * 必需素材会缺失，表现为预览图渲染失败、导出视频卡住。这里给用户一个手动补齐的入口。
 *
 * <p>补齐是幂等的：只复制缺失或 0 字节的文件，用户自己上传/替换过的素材不会被覆盖。
 */
const AssetMaintenanceSection: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [assetsDir, setAssetsDir] = useState('');
  const [bundledAvailable, setBundledAvailable] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const info = await ApiService.getAssetDiagnostics();
      setAssetsDir(info.assetsDir || '');
      setBundledAvailable(!!info.bundledAvailable);
      setMissing(info.missing || []);
      setError('');
    } catch (e: any) {
      setError(`素材自检失败：${e?.message || e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRepair = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await ApiService.repairAssets();
      const sync = result.sync;
      const diagnostics = result.diagnostics;

      if (!sync.bundledAvailable) {
        setMessage(`安装包内没有找到素材目录${sync.bundledDir ? `（${sync.bundledDir}）` : ''}，无法自动补齐。本地开发模式下这是正常的。`);
      } else if (sync.copied > 0) {
        setMessage(
          `已从安装包补齐 ${sync.copied} 个素材文件（已存在 ${sync.skipped} 个，共 ${sync.bundledFiles} 个）。` +
          `${diagnostics.ok ? '必需素材现已齐全。' : `仍需检查：${(diagnostics.missing || []).join('、')}`}`,
        );
      } else {
        setMessage(`素材本来就是齐的（共 ${sync.bundledFiles} 个文件，无需补齐）。`);
      }

      if (sync.failed && sync.failed.length > 0) {
        setError(`有 ${sync.failed.length} 个文件补齐失败：${sync.failed.slice(0, 5).join('；')}`);
      }

      setAssetsDir(diagnostics.assetsDir || '');
      setMissing(diagnostics.missing || []);
    } catch (e: any) {
      setError(`补齐素材失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="settings-section">
      <h3>素材自检与修复</h3>
      <div className="settings-section-content">
        <p className="settings-hint">
          界面素材（ui）与特效素材（effects）是渲染和导出的必需文件。如果预览图或导出视频报错、或提示缺少素材，
          可以点下面的按钮从安装包里把缺失的素材补齐。
        </p>
        {assetsDir && <p className="settings-hint">素材目录：{assetsDir}</p>}
        {missing.length > 0 ? (
          <p className="settings-warning">缺少必需素材：{missing.join('、')}</p>
        ) : (
          <p className="settings-hint">必需素材检查：齐全</p>
        )}
        {!bundledAvailable && (
          <p className="settings-hint">未检测到安装包素材目录（开发模式或安装不完整）。</p>
        )}
        {message && <p className="settings-hint">{message}</p>}
        {error && <p className="settings-warning">{error}</p>}
        <button className="save-button" onClick={handleRepair} disabled={busy}>
          {busy ? '正在补齐…' : '从安装包补齐缺失素材'}
        </button>
      </div>
    </div>
  );
};

export default AssetMaintenanceSection;
