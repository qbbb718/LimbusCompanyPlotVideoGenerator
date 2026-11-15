#!/usr/bin/env node
/**
 * Build the asset payload that electron-builder packages: `demo/pack/{assets,data}`.
 *
 * <h2>Why this exists</h2>
 * Local development writes into the *data root* (`%APPDATA%\limbus-company-plot-video-generator`
 * by default, see `RuntimePaths` in the backend): characters created in 资源管理 land in
 * `<dataRoot>/assets/characters/`, sequence-frame animations in
 * `<dataRoot>/assets/animation-clips/`, and the project library in `<dataRoot>/data/project.db`.
 * The packaging sources are a different pair of folders (`demo/assets`, `demo/data`), so
 * anything developed locally and never copied over by hand was silently missing from the
 * installer - the app looked broken out of the box (某个角色没有立绘、序列帧动画列表空空)
 * although the files were sitting on the dev machine.
 *
 * This script assembles **one** payload folder used as the single `extraResources` source:
 *
 *   demo/pack/assets  = demo/assets  + dev assets/characters, animation-clips, thumbnails
 *   demo/pack/data    = demo/data    + dev data/project.db (+ its -wal), records.json
 *
 * <h2>Two profiles, two installers</h2>
 * Every packaging run builds both installers (see build-package.bat and release.yml), so the
 * payload is assembled twice with a different profile:
 *
 *   - `full` (default): everything above - the "works out of the box" installer, several hundred
 *     MB of character art included;
 *   - `--lite`: only `ui/`, `effects/`, `fonts/` from the curated assets, no dev overlay and no
 *     `data/` at all (the backend creates an empty library on first start). This is the small
 *     installer that also owns the auto-update channel (`latest.yml`), so updates stay small -
 *     an existing user's resources live in their own data directory and are never touched.
 *
 * The lite build has to run *after* the full one (it overwrites `latest.yml`), and the full
 * payload is rebuilt afterwards so `demo/pack` is left in its default state.
 *
 * <h2>Why one folder instead of a second `extraResources` entry</h2>
 * Two `extraResources` entries pointing at the same `to` destination are copied **concurrently**
 * by app-builder-lib (`copyFiles` maps over the matchers), so when both contain the same
 * relative path the winner is whatever finishes last - measured: with a 200 KB and a 900 KB file
 * at the same path, round 2 of 5 kept the wrong one. That would mean "the packaged project.db is
 * sometimes the old curated one" and "the packaged 立绘 sometimes miss the dev update", which is
 * exactly the kind of bug nobody can reproduce. Merging here is sequential and deterministic:
 * the dev copy always wins.
 *
 * <h2>Rebuilt every time</h2>
 * The payload folder is deleted and rebuilt on every run, so a deleted character (or a
 * checkpointed `-wal`) cannot survive from an earlier build.
 *
 * <h2>Exit codes</h2>
 *   0  payload built (dev content included when a data root was found, curated set otherwise)
 *   1  a real failure (bad argument, I/O error, unsafe output path, not a SQLite database, ...)
 * A missing data root is not an error, because CI has no local dev data: it prints a clear
 * line and packages the curated set, i.e. exactly what shipped before this script existed.
 *
 * Usage (from the repository root):
 *   node scripts/pack-assets.mjs
 *   node scripts/pack-assets.mjs --data-root "D:\SOFTWARE\LCP"
 *   node scripts/pack-assets.mjs --assets characters,animation-clips,thumbnails,backgrounds
 *   node scripts/pack-assets.mjs --no-database
 *   node scripts/pack-assets.mjs --dry-run
 *
 * Keep this file ASCII-only: it runs inside a cmd.exe window whose code page is not guaranteed
 * to be UTF-8 (same rule as scripts/changelog.mjs). Chinese explanations live in
 * docs/打包说明.md.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, "..");

/** App data directory name, mirroring RuntimePaths.APP_DIR_NAME in the backend. */
export const APP_DIR_NAME = "limbus-company-plot-video-generator";

/** The demo folder that holds the curated `assets/` and `data/` sources. */
export const DEFAULT_BASE_DIR = path.join(ROOT, "demo");

/**
 * Dev asset subfolders overlaid on the curated ones.
 *
 * `characters` + `animation-clips` are what a local session actually creates. `thumbnails` is
 * appended because portrait rows reference `/assets/thumbnails/...`; it is one small file today
 * and copying it costs nothing, while missing it shows up as broken thumbnails in 资源管理.
 */
export const DEFAULT_ASSET_DIRS = ["characters", "animation-clips", "thumbnails"];

/**
 * Asset folders of the **lite** payload, i.e. what the app cannot run without.
 *
 * The lite installer ships no characters / backgrounds / audios / animation clips and no starter
 * database (`DatabaseInitializer` creates an empty library on first start), so users import the
 * resources they want. `ui/` + `effects/` + `fonts/` must stay: preview rendering and video
 * export hard-fail without them (see AssetMaintenanceService.REQUIRED_UI_FILES).
 */
export const LITE_ASSET_DIRS = ["ui", "effects", "fonts"];

/**
 * Files of `<dataRoot>/data` that are overlaid.
 *
 * `project.db-wal` belongs to `project.db`: the build script force-stops the app before
 * packaging, which leaves an unflushed WAL behind, and those rows only exist once SQLite
 * replays it. Copying the `.db` alone would ship a library a few sessions out of date.
 * `project.db-shm` is deliberately not copied - SQLite rebuilds it.
 */
export const DEV_DATA_FILES = ["project.db", "records.json"];
const DB_WAL = "project.db-wal";

/**
 * Ownership marker inside the payload folder.
 *
 * `assertSafeOutDir` only agrees to `rm -rf` a non-empty folder that carries this file, so a
 * mistyped `--out` cannot delete unrelated content. It is written before the first copy, which
 * makes a build that died halfway retryable.
 */
export const MARKER_FILE = ".pack-assets-marker.json";

/** `SQLite format 3\0` - a cheap guard against shipping a truncated / unrelated file. */
const SQLITE_MAGIC = Buffer.from("SQLite format 3\u0000", "latin1");

/* ==================== arguments ==================== */

/**
 * Parse argv (without node + script) into options.
 *
 * @param {string[]} argv
 * @returns {{dataRoot: string|null, baseDir: string, outDir: string|null, assetDirs: string[],
 *            database: boolean, dryRun: boolean, requireSource: boolean, help: boolean}}
 */
export function parseArgs(argv = []) {
  const options = {
    dataRoot: null,
    baseDir: DEFAULT_BASE_DIR,
    outDir: null,
    assetDirs: [...DEFAULT_ASSET_DIRS],
    database: true,
    dryRun: false,
    requireSource: false,
    force: false,
    profile: "full",
    help: false,
  };

  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i];
    const value = () => {
      const next = list[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      i += 1;
      return next;
    };

    switch (arg) {
      case "--data-root":
        options.dataRoot = value();
        break;
      case "--base-dir":
        options.baseDir = path.resolve(value());
        break;
      case "--out":
        options.outDir = path.resolve(value());
        break;
      case "--assets":
        options.assetDirs = splitList(value());
        break;
      case "--no-database":
        options.database = false;
        break;
      case "--lite":
        options.profile = "lite";
        break;
      case "--profile": {
        const profile = value();
        if (profile !== "full" && profile !== "lite") {
          throw new Error(`--profile must be full or lite, got: ${profile}`);
        }
        options.profile = profile;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--require-source":
        options.requireSource = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.assetDirs.length === 0) {
    throw new Error("--assets was given an empty list");
  }
  for (const name of options.assetDirs) {
    if (!isSafeFolderName(name)) {
      throw new Error(`invalid asset folder name: ${name}`);
    }
  }
  if (options.profile === "lite" && argv.some((arg) => String(arg).startsWith("--assets"))) {
    throw new Error("--assets cannot be combined with --lite (the lite profile has a fixed set)");
  }
  return options;
}

/** "a, b ,c" -> ["a","b","c"] (empty entries dropped) */
function splitList(text) {
  return String(text || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A single path segment we are willing to join onto a path.
 *
 * Guards `--assets ../..` and friends: the payload folder is deleted with `rm -r` and these
 * names are joined onto it, so a name that escapes its parent would be able to delete
 * unrelated files.
 */
export function isSafeFolderName(name) {
  if (typeof name !== "string" || name.length === 0) return false;
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

/* ==================== data root resolution ==================== */

/**
 * Platform default data root, identical to `RuntimePaths.resolveDataRoot()`.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function defaultDataRoot(env = process.env) {
  const appData = env.APPDATA;
  if (appData && appData.trim()) return path.join(appData.trim(), APP_DIR_NAME);
  return path.join(os.homedir(), `.${APP_DIR_NAME}`);
}

/**
 * Resolve which data root to read, plus where that decision came from.
 *
 * Priority: `--data-root` > `LBC_DATA_DIR` > the platform default. The Electron main process
 * additionally reads `<default root>/data-location.json` (设置页「资源存储位置」), but that file is
 * an *installed app* feature: a backend started by `mvn spring-boot:run` / `start_all.bat` never
 * sees it and writes to the default root instead. Following Electron's order here would point
 * the script at a stale folder on a dev machine, so it is only reported as a hint
 * (see {@link readDataLocationHint}).
 *
 * @param {{dataRoot?: string|null, env?: NodeJS.ProcessEnv}} [input]
 * @returns {{dataRoot: string, source: "cli"|"env"|"default"}}
 */
export function resolveDataRoot(input = {}) {
  const env = input.env || process.env;
  if (input.dataRoot && String(input.dataRoot).trim()) {
    return { dataRoot: path.resolve(String(input.dataRoot).trim()), source: "cli" };
  }
  const fromEnv = env.LBC_DATA_DIR;
  if (fromEnv && String(fromEnv).trim()) {
    return { dataRoot: path.resolve(String(fromEnv).trim()), source: "env" };
  }
  return { dataRoot: defaultDataRoot(env), source: "default" };
}

/**
 * Read `<defaultRoot>/data-location.json` written by the settings page, if any.
 *
 * Only used to print a hint when it points somewhere other than the folder we read - a mismatch
 * is the most likely reason for "我的素材怎么还是没进包".
 *
 * @param {string} defaultRoot
 * @returns {{dataRoot: string, configFile: string}|null}
 */
export function readDataLocationHint(defaultRoot) {
  const configFile = path.join(defaultRoot, "data-location.json");
  try {
    if (!fs.existsSync(configFile)) return null;
    // Written as UTF-8 JSON; a stray BOM or trailing junk must not break the build.
    const text = fs.readFileSync(configFile, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(text);
    const dataRoot = typeof parsed?.dataRoot === "string" ? parsed.dataRoot.trim() : "";
    return dataRoot ? { dataRoot, configFile } : null;
  } catch {
    return null;
  }
}

/* ==================== safety ==================== */

/** True when `child` is `parent` or lives inside it. */
export function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Refuse a payload folder whose deletion would destroy sources or the repository.
 *
 * The script does `rm -rf <out>` before assembling, so the checks have two layers:
 *
 *   1. structural - it must live inside the repository, must not be the repository root, the
 *      demo folder, the curated `assets/` or `data/`, and must not contain them (`--out demo`
 *      would otherwise delete the curated sources, `--out demo/assets` would delete them from
 *      the inside);
 *   2. ownership - an existing non-empty folder is only rebuilt when it carries this script's
 *      marker file, so a typo such as `--out scripts` cannot wipe an unrelated folder. The
 *      marker is written before any copying, which keeps a build that died halfway retryable.
 *
 * @param {string} outDir candidate payload folder (absolute)
 * @param {{baseDir?: string, repoRoot?: string, force?: boolean}} [context]
 */
export function assertSafeOutDir(outDir, context = {}) {
  const out = path.resolve(outDir);
  const base = path.resolve(context.baseDir || DEFAULT_BASE_DIR);
  const repoRoot = path.resolve(context.repoRoot || ROOT);

  if (out === repoRoot || !isInside(out, repoRoot)) {
    throw new Error(`refusing to use ${out} as the payload folder: it is outside the repository`);
  }
  // The payload folder lives *inside* the demo folder (demo/pack), so only "contains the demo
  // folder" is dangerous here; the curated sources are protected in both directions.
  if (isInside(base, out)) {
    throw new Error(
      `refusing to use ${out} as the payload folder: it contains ${base}, ` +
        "which the payload is built from",
    );
  }
  for (const curatedDir of [path.join(base, "assets"), path.join(base, "data")]) {
    if (isInside(curatedDir, out)) {
      throw new Error(
        `refusing to use ${out} as the payload folder: it contains ${curatedDir}, ` +
          "which the payload is built from",
      );
    }
    if (isInside(out, curatedDir)) {
      throw new Error(`refusing to use ${out} as the payload folder: it is inside ${curatedDir}`);
    }
  }

  if (context.force) return;
  if (!fs.existsSync(out)) return;
  const entries = fs.readdirSync(out);
  if (entries.length === 0) return;
  if (!fs.existsSync(path.join(out, MARKER_FILE))) {
    throw new Error(
      `refusing to rebuild ${out}: it is not empty and does not look like a payload folder ` +
        `(no ${MARKER_FILE}). Deliver it with --force if you are sure.`,
    );
  }
}

/* ==================== planning ==================== */

/**
 * Decide what the payload will contain, without touching the disk.
 *
 * Two profiles:
 *   - `full`  curated `demo/assets` + `demo/data`, with the locally developed characters /
 *             animation clips / database overlaid (see the module comments);
 *   - `lite`  only {@link LITE_ASSET_DIRS} copied from the curated assets, no dev overlay, no
 *             `data/` at all.
 *
 * @param {{dataRoot: string, baseDir?: string, assetDirs?: string[], database?: boolean,
 *          profile?: "full"|"lite"}} input
 * @returns {{profile: string, devAvailable: boolean, reason: string, curated: object,
 *            dev: object, lite: object[], warnings: string[]}}
 */
export function planPayload(input) {
  const baseDir = path.resolve(input.baseDir || DEFAULT_BASE_DIR);
  const dataRoot = path.resolve(input.dataRoot);
  const assetDirs = input.assetDirs || DEFAULT_ASSET_DIRS;
  const withDatabase = input.database !== false;
  const profile = input.profile === "lite" ? "lite" : "full";

  const curatedAssets = path.join(baseDir, "assets");
  const curatedData = path.join(baseDir, "data");
  const plan = {
    profile,
    baseDir,
    dataRoot,
    devAvailable: false,
    reason: "",
    curated: {
      assets: { dir: curatedAssets, exists: isDirectory(curatedAssets), files: 0 },
      data: { dir: curatedData, exists: isDirectory(curatedData), files: 0 },
    },
    dev: { assets: [], data: [] },
    /** lite profile: the curated folders that get copied (ui / effects / fonts) */
    lite: [],
    warnings: [],
  };

  if (plan.curated.assets.exists) plan.curated.assets.files = countFiles(curatedAssets);
  if (plan.curated.data.exists) plan.curated.data.files = countFiles(curatedData);

  if (profile === "lite") {
    for (const name of LITE_ASSET_DIRS) {
      const source = path.join(curatedAssets, name);
      const present = isDirectory(source);
      plan.lite.push({
        name,
        source,
        present,
        files: present ? countFiles(source) : 0,
        // `fonts` is a single file, the other two are folders; entries are informational only.
        entries: present ? listFolders(source) : [],
      });
      if (!present) {
        plan.warnings.push(`lite profile: curated assets are missing ${source}`);
      }
    }
    plan.reason = "lite profile: only ui/effects/fonts are packaged";
    return plan;
  }

  const devAssetsRoot = path.join(dataRoot, "assets");
  if (!isDirectory(dataRoot) || !isDirectory(devAssetsRoot)) {
    plan.reason = isDirectory(dataRoot)
      ? `no assets folder in the data root: ${devAssetsRoot}`
      : `data root not found: ${dataRoot}`;
    return plan;
  }

  for (const name of assetDirs) {
    const source = path.join(devAssetsRoot, name);
    if (!isDirectory(source)) {
      plan.dev.assets.push({ name, source, present: false, files: 0, entries: [] });
      continue;
    }
    plan.dev.assets.push({
      name,
      source,
      present: true,
      files: countFiles(source),
      entries: listFolders(source),
    });
  }

  if (withDatabase) {
    const devData = path.join(dataRoot, "data");
    for (const file of DEV_DATA_FILES) {
      const source = path.join(devData, file);
      if (!isFile(source)) continue;
      plan.dev.data.push({ name: file, source, bytes: fs.statSync(source).size });
    }
    const database = plan.dev.data.find((item) => item.name === "project.db");
    const wal = path.join(devData, DB_WAL);
    if (database && isFile(wal)) {
      plan.dev.data.push({ name: DB_WAL, source: wal, bytes: fs.statSync(wal).size });
      plan.warnings.push(
        `${DB_WAL} is present, so it is packaged next to project.db ` +
          "(the app was running or was force-stopped); SQLite replays it on first open.",
      );
    }
  }

  plan.devAvailable = plan.dev.assets.some((item) => item.present) || plan.dev.data.length > 0;
  if (!plan.devAvailable) {
    plan.reason = `nothing to overlay from ${dataRoot} (no ${assetDirs.join("/")} and no database)`;
  }
  return plan;
}

/* ==================== payload assembly ==================== */

/**
 * Assemble `outDir` from the curated sources plus the dev overlay.
 *
 * @param {object} options
 * @param {string} options.dataRoot
 * @param {string} [options.baseDir]
 * @param {string} [options.outDir]
 * @param {string[]} [options.assetDirs]
 * @param {boolean} [options.database]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.requireSource]
 * @param {string} [options.repoRoot] only the self-test passes this
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<object>} { outDir, manifest }
 */
export async function buildPayload(options = {}) {
  const log = options.log || (() => {});
  const baseDir = path.resolve(options.baseDir || DEFAULT_BASE_DIR);
  const outDir = path.resolve(options.outDir || path.join(baseDir, "pack"));
  const repoRoot = path.resolve(options.repoRoot || ROOT);
  assertSafeOutDir(outDir, { baseDir, repoRoot, force: options.force });

  const plan = planPayload({
    dataRoot: options.dataRoot || defaultDataRoot(),
    baseDir,
    assetDirs: options.assetDirs,
    database: options.database,
    profile: options.profile,
  });
  const profile = plan.profile;

  if (!plan.curated.assets.exists) {
    throw new Error(`curated assets folder is missing: ${plan.curated.assets.dir}`);
  }
  if (profile === "lite") {
    log("  profile: lite (ui/effects/fonts only - no characters, backgrounds, audios, clips or database)");
    if (plan.warnings.length > 0) {
      throw new Error(plan.warnings.join("; "));
    }
  } else if (!plan.devAvailable) {
    if (options.requireSource) throw new Error(plan.reason);
    log(`[INFO] no local dev data to overlay: ${plan.reason}`);
    log("       packaging the curated demo/assets + demo/data set only (this is the CI case).");
  }

  // The database is validated before anything is deleted: a truncated file must not cost the
  // previous payload (a failed build keeps the last good installer around).
  const devDatabase = plan.dev.data.find((item) => item.name === "project.db");
  if (devDatabase) assertSqlite(devDatabase.source, devDatabase.bytes);

  const manifest = {
    generatedAt: new Date().toISOString(),
    profile,
    outDir,
    baseDir,
    dataRoot: plan.dataRoot,
    devAvailable: plan.devAvailable,
    devReason: plan.devAvailable ? "" : plan.reason,
    dryRun: Boolean(options.dryRun),
    assets: [],
    data: [],
    warnings: [...plan.warnings],
  };

  if (options.dryRun) {
    const planned = profile === "lite" ? plan.lite : plan.dev.assets;
    for (const item of planned) {
      manifest.assets.push({
        name: item.name,
        present: item.present,
        fromDev: profile === "lite" ? 0 : item.present ? item.files : 0,
        entries: item.entries,
      });
      if (profile === "lite") {
        log(`  ${item.name}: ${item.present ? `${item.files} curated files` : "MISSING from demo/assets"}`);
      } else {
        log(
          item.present
            ? `  ${item.name}: curated + ${item.files} dev files (${item.entries.length} entries)`
            : `  ${item.name}: curated only (no such folder in the data root)`,
        );
      }
    }
    if (profile === "full") {
      for (const item of plan.dev.data) {
        manifest.data.push({ name: item.name, source: "curated+dev", bytes: item.bytes });
        log(`  data/${item.name}: curated + dev (${formatBytes(item.bytes)} from the data root)`);
      }
    }
    log(`[OK] would build ${outDir}`);
    return { outDir, manifest };
  }

  // Rebuild from scratch: nothing from an earlier run may leak into this installer.
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(outDir, { recursive: true });
  // Ownership marker first: if the rest of this function dies, the folder stays recognisable and
  // the next run is allowed to rebuild it (see assertSafeOutDir).
  await fsp.writeFile(
    path.join(outDir, MARKER_FILE),
    `${JSON.stringify({ generatedBy: "scripts/pack-assets.mjs", version: 1 }, null, 2)}\n`,
    "utf8",
  );

  if (profile === "lite") {
    // Only the folders the app cannot run without, straight from the curated assets. No dev
    // overlay, no `data/`: a fresh install gets an empty library from DatabaseInitializer.
    for (const item of plan.lite) {
      const target = path.join(outDir, "assets", item.name);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.cp(item.source, target, { recursive: true, preserveTimestamps: true });
      const measured = measureTree(target);
      manifest.assets.push({ name: item.name, present: true, fromDev: 0, ...measured });
      log(`  ${item.name}: ${measured.files} files, ${formatBytes(measured.bytes)}`);
    }
    const assetFiles = countFiles(path.join(outDir, "assets"));
    manifest.totalAssetFiles = assetFiles;
    manifest.totalDataFiles = 0;
    await fsp.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    log(`[OK] ${assetFiles} asset files + 0 data files -> ${outDir} (lite profile)`);
    return { outDir, manifest };
  }

  await fsp.cp(plan.curated.assets.dir, path.join(outDir, "assets"), {
    recursive: true,
    preserveTimestamps: true,
  });
  if (plan.curated.data.exists) {
    await fsp.cp(plan.curated.data.dir, path.join(outDir, "data"), {
      recursive: true,
      preserveTimestamps: true,
    });
  }

  for (const item of plan.dev.assets) {
    const target = path.join(outDir, "assets", item.name);
    if (!item.present) {
      // Keep whatever the curated set has for this folder; note the absence for the log.
      manifest.assets.push({
        name: item.name,
        present: false,
        fromDev: 0,
        files: countFiles(target),
        bytes: measureTree(target).bytes,
      });
      log(`  ${item.name}: curated only (no such folder in the data root)`);
      continue;
    }
    // Per-entry merge (force: true keeps existing entries and overwrites same-named ones):
    // the curated background/ui/... folders and the curated character folders both survive,
    // while a dev character with the same folder name wins - deterministically, because this
    // copy is sequential.
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.cp(item.source, target, { recursive: true, force: true, preserveTimestamps: true });
    const measured = measureTree(target);
    manifest.assets.push({
      name: item.name,
      present: true,
      fromDev: item.files,
      entries: item.entries,
      ...measured,
    });
    log(
      `  ${item.name}: curated + ${item.files} dev files -> ${measured.files} files, ` +
        `${formatBytes(measured.bytes)} (${item.entries.length} dev entries)`,
    );
  }

  if (plan.dev.data.length > 0) {
    const dataTarget = path.join(outDir, "data");
    await fsp.mkdir(dataTarget, { recursive: true });
    for (const item of plan.dev.data) {
      await fsp.copyFile(item.source, path.join(dataTarget, item.name));
      manifest.data.push({ name: item.name, source: "curated+dev", bytes: item.bytes });
      log(`  data/${item.name}: curated + dev (${formatBytes(item.bytes)})`);
    }
  } else if (options.database === false) {
    log("  data: curated only (--no-database)");
  } else {
    log("  data: curated only");
  }

  // Counted from the assembled folders, not from the per-overlay list: the payload also contains
  // the curated folders this script never touches (ui/, fonts/, effects/, backgrounds/, audios/).
  const assetFiles = countFiles(path.join(outDir, "assets"));
  const dataFiles = countFiles(path.join(outDir, "data"));
  manifest.totalAssetFiles = assetFiles;
  manifest.totalDataFiles = dataFiles;

  // Written last so it describes what actually landed; electron-builder never packages it
  // (only `pack/assets` and `pack/data` are mapped).
  await fsp.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  log(
    `[OK] ${assetFiles} asset files + ${dataFiles} data files -> ${outDir}` +
      (plan.devAvailable ? " (dev content included)" : " (curated set only)"),
  );
  return { outDir, manifest };
}

/** Cheap "is this really a SQLite database" check. */
function assertSqlite(file, bytes) {
  if (bytes === 0) throw new Error(`${file} is empty, refusing to package it`);
  if (bytes < SQLITE_MAGIC.length) throw new Error(`${file} is too small to be a SQLite database`);
  const handle = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(SQLITE_MAGIC.length);
    fs.readSync(handle, head, 0, head.length, 0);
    if (!head.equals(SQLITE_MAGIC)) {
      throw new Error(`${file} is not a SQLite database (bad header), refusing to package it`);
    }
  } finally {
    fs.closeSync(handle);
  }
}

/* ==================== helpers ==================== */

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

/** Immediate subfolder names of `dir` (what 资源管理 shows as entries). */
function listFolders(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** Recursive file count of `dir`. */
function countFiles(dir) {
  return measureTree(dir).files;
}

/** Recursive file count and byte size of `dir`. */
function measureTree(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch {
          // A file that vanished mid-walk only costs an inaccurate total.
        }
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

/** 1234567 -> "1.2 MB" */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

const USAGE = `Usage: node scripts/pack-assets.mjs [options]

Profiles:
  default (full)  demo/assets + demo/data, with the locally developed characters,
                  animation clips and database overlaid -> the "everything works out
                  of the box" installer
  --lite          ui/effects/fonts only, no dev overlay, no database -> the small
                  installer whose users import resources themselves

Options:
  --data-root <dir>   where locally developed assets + database live (full profile only)
                      (default: $LBC_DATA_DIR, else %APPDATA%\\${APP_DIR_NAME})
  --base-dir <dir>    demo folder holding the curated assets/ and data/ (default: <repo>/demo)
  --out <dir>         payload folder to rebuild (default: <base-dir>/pack)
  --assets <list>     dev asset folders overlaid on the curated ones (full profile only)
                      (default: ${DEFAULT_ASSET_DIRS.join(",")})
  --no-database       never overlay the local project database (full profile only)
  --dry-run           report what would be packaged, change nothing
  --require-source    fail when the data root has no assets folder (default: curated set only)
  --force             allow rebuilding a non-empty --out that this script did not create
  -h, --help          show this text
`;

/**
 * CLI entry point.
 *
 * @param {string[]} argv
 * @returns {Promise<number>} process exit code
 */
export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    console.error(USAGE);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const resolved = resolveDataRoot({ dataRoot: options.dataRoot });
  console.log(`Local data root (${resolved.source}): ${resolved.dataRoot}`);
  const hint = readDataLocationHint(defaultDataRoot());
  if (hint && path.resolve(hint.dataRoot) !== path.resolve(resolved.dataRoot)) {
    console.log(`[INFO] data-location.json points at ${hint.dataRoot}`);
    console.log(`       (${hint.configFile})`);
    console.log("       the installed app uses that folder; pass --data-root to package it instead.");
  }

  try {
    await buildPayload({ ...options, dataRoot: resolved.dataRoot, log: (line) => console.log(line) });
    return 0;
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
