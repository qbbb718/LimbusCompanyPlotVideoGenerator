/**
 * latest.yml 的解析与版本比较 —— 纯函数，不 require electron，所以能被 Node 单测直接跑。
 *
 * <p>为什么单独一个文件：这几个函数决定"要不要提示更新"和"本地安装包是不是官方的"。
 * 它们写错时**不会有任何报错**——表现就是"永远发现不了新版本"或"永远拒绝安装"，
 * 而主进程代码一 require electron 就没法在纯 Node 里测了。所以解析逻辑放这里，
 * 由 `public/update-service.js` require 进去，配 `scripts/update-manifest.test.mjs` 钉住格式。
 *
 * <p>latest.yml 是 electron-builder 生成的固定格式（NSIS / Windows）：
 *
 * ```yaml
 * version: 0.6.0
 * files:
 *   - url: LCP0.6.0.exe
 *     sha512: <base64>
 *     size: 300653924
 * path: LCP0.6.0.exe
 * sha512: <base64>
 * releaseDate: '2026-11-09T14:57:19.765Z'
 * ```
 *
 * 只解析这里用得到的字段（version / files[].url / sha512 / size / path），
 * 不引 yaml 依赖：为一个格式稳定的文件给安装包多加一个包不划算。
 */

const path = require("path");

/** "0.6.0" -> [0, 6, 0]；不是严格的 x.y.z 就返回 null（与 scripts/version.mjs 的约束一致） */
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** 比较两个 x.y.z：左大返回 1，相等 0，右大 -1；任一侧解析不了时返回 0（当作"没法比较"） */
function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

/**
 * @param {string} text latest.yml 的内容
 * @returns {{version: string|null, files: {url: string, sha512: string, size: number}[], path: string|null}}
 */
function parseLatestYml(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const manifest = { version: null, files: [], path: null };
  let inFiles = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line) continue;

    const versionMatch = /^version:\s*(\S+)$/.exec(line);
    if (versionMatch) {
      manifest.version = versionMatch[1];
      continue;
    }

    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      current = null;
      continue;
    }

    if (inFiles) {
      const urlMatch = /^\s*-\s*url:\s*(\S+)$/.exec(line);
      if (urlMatch) {
        current = { url: urlMatch[1], sha512: "", size: 0 };
        manifest.files.push(current);
        continue;
      }
      if (current) {
        const shaMatch = /^\s+sha512:\s*(\S+)$/.exec(line);
        if (shaMatch) {
          current.sha512 = shaMatch[1];
          continue;
        }
        const sizeMatch = /^\s+size:\s*(\d+)$/.exec(line);
        if (sizeMatch) {
          current.size = Number(sizeMatch[1]);
          continue;
        }
      }
      // 到了下一个顶层键（path / sha512 / releaseDate ...），files 段结束
      if (/^\S/.test(line)) inFiles = false;
    }

    const pathMatch = /^path:\s*(\S+)$/.exec(line);
    if (pathMatch) manifest.path = pathMatch[1];
  }

  return manifest;
}

/**
 * 在 manifest 里找某个文件名的记录（按 basename 忽略大小写匹配）。
 * 老版本 electron-builder 只写顶层 `path`，所以那里也要兜一层。
 */
function findManifestFile(manifest, fileName) {
  const wanted = String(fileName || "").toLowerCase();
  const files = Array.isArray(manifest && manifest.files) ? manifest.files : [];
  const hit = files.find(
    (file) => path.basename(String((file && file.url) || "")).toLowerCase() === wanted,
  );
  if (hit) return hit;
  if (manifest && manifest.path && path.basename(manifest.path).toLowerCase() === wanted) {
    return { url: manifest.path, sha512: "", size: 0 };
  }
  return null;
}

/**
 * 从若干个"能连上的源"里挑一个目标：版本最新者优先，同版本时响应最快者优先。
 *
 * @param {{source: object, manifest: {version: string}, elapsedMs: number}[]} reachable
 * @param {string} currentVersion 当前应用版本
 * @returns {object|null} 没有比当前更新的版本时返回 null（= 已是最新）
 */
function pickTarget(reachable, currentVersion) {
  let best = null;
  for (const item of reachable || []) {
    const version = item && item.manifest && item.manifest.version;
    if (!version) continue;
    if (compareVersions(version, currentVersion) <= 0) continue;
    if (!best) {
      best = item;
      continue;
    }
    const newer = compareVersions(version, best.manifest.version);
    if (newer > 0 || (newer === 0 && item.elapsedMs < best.elapsedMs)) best = item;
  }
  return best;
}

module.exports = {
  parseVersion,
  compareVersions,
  parseLatestYml,
  findManifestFile,
  pickTarget,
};
