import React, { useEffect, useState } from 'react';
import '../Settings.css';

/**
 * 「关于」里的版本号 / 构建信息。
 *
 * <p>版本号的唯一真源是 `demo/frontend/electron-react-app/package.json` 的 `version`，
 * 由 `node scripts/version.mjs <x.y.z> --write` 一次性同步到 pom.xml、package-lock.json
 * 和 application.yml（后端日志与 /api/health）。这里**不写死版本号**，而是通过
 * `window.electronAPI.getAppVersion()` 取主进程的 `app.getVersion()`——它就是 electron-builder
 * 用来生成安装包文件名和自动更新源的同一个值，因此界面上显示的版本、安装包文件名、
 * 日志里的版本必然一致，改版本号时这个组件不需要跟着改。
 *
 * <p>浏览器模式（非 Electron，没有主进程）取不到真实版本，显示“网页版”而不是瞎猜一个值。
 */
const VersionInfo: React.FC = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.getAppVersion) {
      // 浏览器模式：没有主进程可问，保持 version=null，由渲染分支显示“网页版”
      return undefined;
    }
    api
      .getAppVersion()
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch((err) => {
        // 取不到版本不该影响设置页其它功能，退化成占位文案
        console.warn('获取应用版本失败:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = version ?? (failed ? '未知' : '网页版');

  return (
    <div className="about-version">
      <span className="about-version-label">版本</span>
      <span className="about-version-value">{shown}</span>
    </div>
  );
};

export default VersionInfo;
