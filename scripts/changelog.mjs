#!/usr/bin/env node
/**
 * Turn docs/版本更新笔记.md (the single place where release notes are written) into the two
 * artifacts the update chain needs:
 *
 *   1. release-notes.md  -> the GitHub Release body. electron-updater reads that body as
 *      `releaseNotes`, so the in-app "更新内容" section gets its text from here for free.
 *   2. changelog.json    -> uploaded as a release asset and read by public/update-service.js.
 *      Needed because the acceleration prefixes (gh-proxy / ghfast) use the generic provider,
 *      which has no release body to hand over - it can only see files next to latest.yml.
 *
 * Usage (from the repository root):
 *   node scripts/changelog.mjs --version v0.6.0 --out release-notes.md
 *   node scripts/changelog.mjs --json release/changelog.json
 *   node scripts/changelog.mjs --list
 *
 * Exit code 1 when the requested version has no section in the notes file: a release whose body
 * silently stays empty is worse than a red CI step, because nobody notices the missing body until
 * users ask "what changed?".
 *
 * Keep this file ASCII-only: it may run in a cmd.exe window with a non-UTF-8 code page.
 * The Chinese text it emits always comes from the notes file, which is read as UTF-8.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_NOTES = path.join(ROOT, "docs/版本更新笔记.md");

/** "## 0.6.0（未发布）" -> version "0.6.0" */
const HEADING_RE = /^##\s+(\d+\.\d+\.\d+)\s*(.*)$/;
/** The horizontal rules that separate sections in the notes file. */
const SEPARATOR_RE = /^\s*-{3,}\s*$/;

/**
 * Split the notes file into version sections.
 *
 * @param {string} text contents of docs/版本更新笔记.md
 * @returns {{version: string, headingSuffix: string, notes: string}[]} in file order
 */
export function parseChangelog(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;

  const push = () => {
    if (!current) return;
    // Sections are separated by "------" lines; those belong to no version.
    const body = current.lines.filter((line) => !SEPARATOR_RE.test(line));
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    sections.push({
      version: current.version,
      headingSuffix: current.headingSuffix,
      notes: body.join("\n").trim(),
    });
  };

  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      push();
      current = { version: heading[1], headingSuffix: (heading[2] || "").trim(), lines: [] };
      continue;
    }
    // A same/higher level heading that is not a version (for example "# 版本更新笔记")
    if (/^#\s/.test(line)) {
      push();
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  push();
  return sections;
}

/** "v0.6.0" / "0.6.0" -> "0.6.0" */
export function stripTagPrefix(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

/**
 * @param {{version: string}[]} sections
 * @param {string} version a plain x.y.z or a v-prefixed tag
 * @returns {{version: string, headingSuffix: string, notes: string} | null}
 */
export function findSection(sections, version) {
  const wanted = stripTagPrefix(version);
  return sections.find((section) => section.version === wanted) || null;
}

/** Newest version first; plain numeric compare, which is enough for x.y.z. */
export function sortByVersionDesc(sections) {
  const parts = (value) => value.split(".").map((piece) => Number(piece) || 0);
  return [...sections].sort((left, right) => {
    const a = parts(left.version);
    const b = parts(right.version);
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return b[i] - a[i];
    }
    return 0;
  });
}

/** The GitHub Release body: the notes plus one line that answers "do I need to uninstall?". */
export function buildReleaseBody(section) {
  return [
    section.notes || "(本次更新没有写更新说明)",
    "",
    "---",
    "覆盖安装到原目录即可，不需要先卸载；角色 / 背景 / 音频素材与工程数据都会保留。",
  ].join("\n");
}

/** changelog.json: { "0.6.1": "<notes>", "0.6.0": "<notes>", ... } */
export function buildChangelogJson(sections) {
  const result = {};
  for (const section of sortByVersionDesc(sections)) {
    if (section.notes) result[section.version] = section.notes;
  }
  return result;
}

function fail(message) {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { notes: DEFAULT_NOTES, version: null, out: null, json: null, list: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--notes") options.notes = path.resolve(ROOT, argv[++i] || "");
    else if (arg === "--version") options.version = argv[++i] || null;
    else if (arg === "--out") options.out = argv[++i] || null;
    else if (arg === "--json") options.json = argv[++i] || null;
    else if (arg === "--list") options.list = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else fail(`unknown option: ${arg}`);
  }
  return options;
}

const USAGE = `Release notes / changelog helper

  node scripts/changelog.mjs --list
      print every version found in docs/版本更新笔记.md (newest first)

  node scripts/changelog.mjs --version v0.6.0 [--out release-notes.md]
      write the GitHub Release body for one version (stdout when --out is omitted)

  node scripts/changelog.mjs --json release/changelog.json
      write every version's notes as JSON (a release asset, read by public/update-service.js)

  --notes <file>   override the notes file (default: docs/版本更新笔记.md)
`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!fs.existsSync(options.notes)) fail(`notes file not found: ${options.notes}`);

  const sections = parseChangelog(fs.readFileSync(options.notes, "utf8"));
  if (!sections.length) fail(`no "## x.y.z" section found in ${options.notes}`);

  if (options.list) {
    for (const section of sortByVersionDesc(sections)) {
      console.log(`${section.version}  ${section.headingSuffix || ""}`.trimEnd());
    }
    return 0;
  }

  if (options.json) {
    const target = path.resolve(ROOT, options.json);
    const changelog = buildChangelogJson(sections);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(changelog, null, 2)}\n`, "utf8");
    console.log(`changelog: ${Object.keys(changelog).length} version(s) -> ${target}`);
    return 0;
  }

  if (!options.version) fail("nothing to do: pass --version <x.y.z> or --json <file> (see --help)");

  const wanted = stripTagPrefix(options.version);
  const section = findSection(sections, wanted);
  if (!section) {
    const available = sortByVersionDesc(sections).map((item) => item.version).join(", ");
    fail(
      `no section for ${wanted} in ${options.notes}\n` +
        `        add "## ${wanted}" at the top of the notes file first; versions found: ${available}`,
    );
  }
  if (!section.notes) {
    fail(`section ${wanted} is empty; the in-app "更新内容" would be blank`);
  }

  const body = buildReleaseBody(section);
  if (!options.out) {
    console.log(body);
    return 0;
  }
  const target = path.resolve(ROOT, options.out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${body}\n`, "utf8");
  console.log(`release notes for ${wanted} -> ${target} (${section.notes.split("\n").length} lines)`);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
