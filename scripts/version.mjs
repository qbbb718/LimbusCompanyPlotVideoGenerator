#!/usr/bin/env node
/**
 * Single source of truth for the application version number.
 *
 * The version lives in exactly two build inputs:
 *   1. demo/frontend/electron-react-app/package.json   "version"      -> electron-builder
 *      (installer file name, app.getVersion() shown in the About dialog, latest.yml/auto-update)
 *   2. demo/pom.xml                                    <project><version>  -> backend jar
 *      (demo/target/demo-<version>.jar; electron.js picks the jar by the "demo-*.jar" pattern,
 *       electron-builder.yml copies it with the filter "demo-*-SNAPSHOT.jar")
 *   package-lock.json only mirrors package.json, so it is synced too.
 *
 * Usage (from the repository root or from anywhere):
 *   node scripts/version.mjs                  report: show every version spot + consistency
 *   node scripts/version.mjs --check          CI: exit 1 when the spots disagree or a tag is missing
 *   node scripts/version.mjs --check 0.2.3    CI on a tag: exit 1 unless every spot is at 0.2.3
 *   node scripts/version.mjs 0.2.3            set 0.2.3 everywhere (dry run: prints the changes)
 *   node scripts/version.mjs 0.2.3 --write    actually write the files
 *
 * Do not hand-edit only one of the two sources: the installer name would then disagree with
 * the backend jar name, which is exactly what happened between v0.1.0 and v0.2.2 — package.json
 * stayed at 0.1.0 while the release notes went up to 0.2.2.
 *
 * Keep this file ASCII-only: it may run in a cmd.exe window with a non-UTF-8 code page.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const PKG_REL = "demo/frontend/electron-react-app/package.json";
const LOCK_REL = "demo/frontend/electron-react-app/package-lock.json";
const POM_REL = "demo/pom.xml";

const PKG = path.join(ROOT, PKG_REL);
const LOCK = path.join(ROOT, LOCK_REL);
const POM = path.join(ROOT, POM_REL);

/** Directories never scanned for stale version strings (build output, deps, reports). */
const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "release",
  "build",
  "target",
  "jre",
  "logs",
  "_to-delete",
  ".vs",
  ".vscode",
]);
/** Text files worth scanning for a leftover hard-coded version string. */
const SCAN_EXTENSIONS = new Set([".md", ".json", ".yml", ".yaml", ".xml", ".bat", ".cmd", ".ps1"]);
/** Files exempt from the stale-reference scan: the helper itself documents example versions. */
const SCAN_SKIP_FILES = new Set([fileURLToPath(import.meta.url)].map((abs) => path.resolve(abs)));

const SEMVER = /^\d+\.\d+\.\d+$/;

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");
const read = (abs) => fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
/** "0.2.3" -> "0.2.3", "0.2.3-SNAPSHOT" -> "0.2.3" (the number used for tags and release notes). */
const baseOf = (value) => String(value ?? "").replace(/-SNAPSHOT$/, "");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}

function parseArgs(argv) {
  const opts = { version: null, write: false, check: false, checkTag: false, help: false };
  for (const arg of argv) {
    if (arg === "--write") opts.write = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--check-tag") opts.checkTag = true;
    else if (arg === "--dry-run") opts.write = false;
    else if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg.startsWith("-")) fail(`unknown option: ${arg}`);
    else if (opts.version === null) opts.version = arg;
    else fail(`unexpected extra argument: ${arg}`);
  }
  return opts;
}

const USAGE = `LimbusCompany Plot Video Generator - version helper

  node scripts/version.mjs                    show every version spot and whether they agree
  node scripts/version.mjs --check            exit 1 when the version spots disagree
  node scripts/version.mjs --check-tag v0.2.3 exit 1 unless every spot is at 0.2.3 and git has that tag
  node scripts/version.mjs <x.y.z>            dry run: show what setting <x.y.z> would change
  node scripts/version.mjs <x.y.z> --write    apply it to package.json, package-lock.json, pom.xml
`;

/* ------------------------------------------------------------------ readers */

function readPackageVersion() {
  const pkg = JSON.parse(read(PKG));
  return { value: pkg.version, name: pkg.name };
}

function readPomVersion() {
  const pom = read(POM);
  // Anchored on <artifactId>demo</artifactId> so the Spring Boot parent version
  // (org.springframework.boot:spring-boot-starter-parent:3.2.0) can never be matched.
  const m = pom.match(/(<artifactId>\s*demo\s*<\/artifactId>\s*<version>)([^<]+)(<\/version>)/);
  if (!m) throw new Error(`cannot locate the project <version> in ${POM_REL}`);
  return m[2].trim();
}

function readLockVersions() {
  if (!fs.existsSync(LOCK)) return null;
  const lock = JSON.parse(read(LOCK));
  return { root: lock.version, packageEntry: lock.packages?.[""]?.version };
}

/* ------------------------------------------------------------------ writers */

/**
 * Scan JSON text for `"<key>": "<value>"` string fields, recording the object depth of each key.
 *
 * package-lock.json needs this: its app version appears at the lock root and again in
 * packages[""], while the 1600+ dependency entries also carry a `version` at the same depth as
 * packages[""] - the two are told apart by position (packages[""] is the first entry of the
 * `packages` object), never by value or by a text marker.
 *
 * @returns {{fields: {value: string, start: number, end: number, depth: number}[],
 *            packagesKeyAt: number | null}}
 *          `start` is the first character of the value and `end` the index of its closing quote,
 *          so patching `text.slice(start, end)` leaves both quotes in place. `packagesKeyAt` is
 *          the offset of a top-level `"packages"` key, which only a lock file has.
 */
function scanJsonStringFields(text, key) {
  const fields = [];
  let packagesKeyAt = null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  let pendingKey = null;
  let pendingKeyDepth = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        const raw = text.slice(stringStart, i);
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === ":") {
          if (raw === "packages" && depth === 1) packagesKeyAt = i;
          pendingKey = raw; // this string is a key
          pendingKeyDepth = depth;
        } else if (pendingKey === key) {
          fields.push({ value: raw, start: stringStart, end: i, depth: pendingKeyDepth });
          pendingKey = null;
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringStart = i + 1;
    } else if (ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
    } else if (ch === ",") {
      pendingKey = null;
    }
  }

  return { fields, packagesKeyAt };
}

/**
 * Rewrite the application version inside package.json / package-lock.json.
 *
 * Depths are relative to the file's root object: the root `"version"` sits at depth 1. Inside a
 * lock file the `packages` object also contains packages[""], whose version has to move with it;
 * that entry is found as the first depth-3 `version` after the `packages` key, so the dependency
 * versions that share that depth are never touched.
 *
 * @returns {{absPath: string, text: string, patches: number, replaced: string[]}}
 */
function patchJsonVersionFields(absPath, replaceWith) {
  const text = read(absPath);
  const label = rel(absPath);
  const { fields, packagesKeyAt } = scanJsonStringFields(text, "version");

  const rootFields = fields.filter((f) => f.depth === 1);
  if (rootFields.length !== 1) {
    throw new Error(`${label}: expected exactly one top-level "version" field, found ${rootFields.length}`);
  }

  const targets = [rootFields[0]];
  if (packagesKeyAt !== null) {
    // package-lock.json: the mirror inside packages[""].
    const inPackagesEntry = fields.filter((f) => f.depth === 3 && f.start > packagesKeyAt);
    if (inPackagesEntry.length === 0) {
      throw new Error(`${label}: no "version" inside packages[""]; regenerate it with "npm install"`);
    }
    targets.push(inPackagesEntry[0]);
  } else if (fields.length !== 1) {
    throw new Error(`${label}: unexpected nested "version" fields (${fields.length}); this is neither package.json nor a lock file`);
  }

  let patched = text;
  // Descending order keeps the offsets of the not-yet-patched field valid.
  for (const field of [...targets].sort((a, b) => b.start - a.start)) {
    patched = `${patched.slice(0, field.start)}${replaceWith}${patched.slice(field.end)}`;
  }

  return { absPath, text: patched, patches: targets.length, replaced: targets.map((f) => f.value) };
}

function stageVersionChanges(current, next) {
  const pomNext = `${next}${current.pom.endsWith("-SNAPSHOT") ? "-SNAPSHOT" : ""}`;
  const staged = [];

  staged.push(patchJsonVersionFields(PKG, next));

  // pom.xml is not JSON: replace its <project><version> text directly. The value
  // (for example "1.0-SNAPSHOT") occurs exactly once in the file, which is asserted here.
  const pomText = read(POM);
  const pomOccurrences = pomText.split(current.pom).length - 1;
  if (pomOccurrences !== 1) {
    throw new Error(`${POM_REL}: expected exactly one occurrence of "${current.pom}", found ${pomOccurrences}`);
  }
  staged.push({ absPath: POM, text: pomText.split(current.pom).join(pomNext), patches: 1, replaced: [current.pom] });

  if (current.lock !== null) {
    staged.push(patchJsonVersionFields(LOCK, next));
  }

  return { staged, pomNext };
}

/** Files that still mention the previous version string after the sources were bumped. */
function findStaleReferences(oldVersion, alreadyStaged) {
  const skip = new Set([...alreadyStaged, ...SCAN_SKIP_FILES].map((abs) => path.resolve(abs)));
  const stale = [];
  const re = new RegExp(`(?<![\\d.])${escapeRegExp(oldVersion)}(?![\\d.])`);

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SCAN_SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile() || skip.has(path.resolve(abs))) continue;
      if (!SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let text;
      try {
        text = read(abs);
      } catch {
        continue;
      }
      text.split(/\r?\n/).forEach((line, index) => {
        if (re.test(line)) stale.push({ file: rel(abs), line: index + 1, text: line.trim() });
      });
    }
  };
  walk(ROOT);
  return stale;
}

/* ------------------------------------------------------------------ reporting */

function collectState() {
  const pkg = readPackageVersion();
  const pom = readPomVersion();
  const lock = readLockVersions();
  const release = baseOf(pkg.value);
  const rows = [
    { spot: `${PKG_REL}  "version"`, value: pkg.value, expected: release, ok: true },
    { spot: `${POM_REL}  <project><version>`, value: pom, expected: release, ok: baseOf(pom) === release },
  ];
  if (lock) {
    rows.push({
      spot: `${LOCK_REL}  "version" (mirror)`,
      value: lock.root ?? "(absent)",
      expected: release,
      ok: lock.root === pkg.value,
    });
    if (lock.packageEntry) {
      rows.push({
        spot: `${LOCK_REL}  packages[""].version (mirror)`,
        value: lock.packageEntry,
        expected: release,
        ok: lock.packageEntry === pkg.value,
      });
    }
  }
  return { pkg, pom, lock, release, rows };
}

function report(state) {
  console.log(`Release version (source of truth: ${PKG_REL}): ${state.release}\n`);
  console.log("Version spots:");
  for (const row of state.rows) {
    console.log(`  ${row.ok ? "OK  " : "DIFF"}  ${row.spot}\n          = ${row.value}`);
  }
  console.log("\nDerived artifacts (regenerate with the normal build; never hand-edit):");
  console.log(`  release/LimbusCompany Plot Video Generator Setup ${state.release}.exe`);
  console.log(`  release/win-unpacked/resources/demo-${state.pom}.jar`);
  console.log("  release/latest.yml  (auto-update feed version)");
  const problems = state.rows.filter((row) => !row.ok);
  if (problems.length) {
    console.log(`\n${problems.length} spot(s) disagree. Fix with: node scripts/version.mjs ${state.release} --write`);
  } else {
    console.log("\nAll spots agree.");
  }
  console.log(`\nNext: add a "## ${state.release}" section to docs/版本更新笔记.md, then commit and tag:`);
  console.log(`      git tag v${state.release}   (a clean tree is required; the tag is what`);
  console.log("      .github/workflows/release.yml builds and publishes from).");
  return problems.length === 0;
}

/**
 * @param state    result of collectState()
 * @param expected a version every spot must be at (a git tag without its "v"), or null for
 *                 "just check that the spots agree with each other".
 * @param checkTag also require the git tag for the version to exist.
 */
function checkMode(state, expected, checkTag) {
  const notes = [];
  if (expected === null) {
    notes.push(
      ...state.rows.filter((row) => !row.ok).map((row) => `${row.spot} = ${row.value}, expected ${row.expected}`),
    );
  } else {
    for (const row of state.rows) {
      if (row.value !== expected && baseOf(row.value) !== expected) {
        notes.push(`${row.spot} = ${row.value}, expected ${expected}`);
      }
    }
  }

  if (checkTag) {
    const tag = `v${expected ?? state.release}`;
    try {
      if (git(["tag", "--list", tag]).trim() !== tag) notes.push(`git tag ${tag} does not exist`);
    } catch {
      notes.push("git is unavailable, cannot verify the tag");
    }
  }

  const suffix = expected === null ? "" : ` (expected ${expected})`;
  console.log(`version: ${state.release}${suffix}`);
  if (!notes.length) {
    console.log(expected === null ? "OK: all version spots agree." : `OK: all version spots are at ${expected}.`);
    return true;
  }
  for (const note of notes) console.error(`[FAIL] ${note}`);
  return false;
}

/* ------------------------------------------------------------------ main */

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const state = collectState();

  if (opts.check || opts.checkTag) {
    if (opts.write) fail("--check does not take --write");
    const raw = opts.version === null ? null : opts.version.replace(/^v/, "");
    if (raw !== null && !SEMVER.test(raw)) {
      fail(`"${opts.version}" is not a plain x.y.z version (pass the tag without its leading "v").`);
    }
    if (opts.checkTag && raw === null) {
      fail("--check-tag needs the tag to check, for example: node scripts/version.mjs --check-tag v0.2.3");
    }
    return checkMode(state, raw, opts.checkTag) ? 0 : 1;
  }

  if (opts.version === null) return report(state) ? 0 : 1;
  if (!SEMVER.test(opts.version)) {
    fail(`"${opts.version}" is not a plain x.y.z version (no leading "v", no suffix). Example: 0.2.3`);
  }

  const next = opts.version;
  const current = { pkg: state.pkg.value, pom: state.pom, lock: state.lock };
  const sourcesMatch = next === baseOf(current.pkg) && next === baseOf(current.pom);
  const mirrorsMatch = state.rows.every((row) => row.ok);

  if (sourcesMatch && mirrorsMatch) {
    console.log(`Nothing to do: every version spot is already at ${next}.`);
    return 0;
  }

  let staged;
  let pomNext;
  try {
    ({ staged, pomNext } = stageVersionChanges(current, next));
  } catch (err) {
    fail(err.message);
  }

  if (sourcesMatch) {
    // Only the package-lock.json mirror had drifted, for example because it was committed
    // separately. Re-writing the two sources with their own value keeps the diff empty.
    console.log(`Version sources are already at ${next}; resyncing the lock file mirror only.`);
  } else {
    console.log(`Version ${current.pkg} -> ${next}`);
    console.log(`  ${PKG_REL}  "version": "${current.pkg}" -> "${next}"`);
    console.log(`  ${POM_REL}  <version>${current.pom}</version> -> <version>${pomNext}</version>`);
  }
  if (current.lock !== null) console.log(`  ${LOCK_REL}  "version" / packages[""].version -> "${next}" (mirrors)`);

  const stale = findStaleReferences(
    current.pkg,
    staged.map((s) => s.absPath),
  );
  if (stale.length) {
    console.log(`\nStill mention ${current.pkg} (release history, docs, package-lock deps):`);
    for (const hit of stale.slice(0, 20)) console.log(`  ${hit.file}:${hit.line}  ${hit.text}`);
    if (stale.length > 20) console.log(`  ... and ${stale.length - 20} more`);
  }

  if (!opts.write) {
    console.log("\nDry run: nothing written. Re-run with --write to apply.");
    return 0;
  }
  for (const s of staged) fs.writeFileSync(s.absPath, s.text, "utf8");
  console.log("\nWritten. Next steps:");
  console.log(`  1. add a "## ${next}" section to docs/版本更新笔记.md`);
  console.log("  2. commit, then: git tag v" + next);
  console.log("  3. push the tag: .github/workflows/release.yml validates and publishes the installer");
  return 0;
}

process.exitCode = main();
