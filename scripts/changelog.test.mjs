#!/usr/bin/env node
/**
 * Self-test for scripts/changelog.mjs.
 *
 * Run: node scripts/changelog.test.mjs
 *
 * The parser decides what users read in the update prompt, so the cases that matter are the
 * boring ones: the "------" rules between sections, the "（未发布）" suffix on the newest heading,
 * an empty section, CRLF input, and "the whole file must not collapse into a single section".
 * The last group runs against the real docs/版本更新笔记.md so a changed heading style breaks here
 * instead of shipping an empty release body.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseChangelog,
  findSection,
  stripTagPrefix,
  sortByVersionDesc,
  buildReleaseBody,
  buildChangelogJson,
} from "./changelog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_NOTES = path.join(ROOT, "docs/版本更新笔记.md");

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
};

const SAMPLE = `# 版本更新笔记

## 0.6.1（未发布）
- 修好了导出卡在 0%
- 新增情绪动画

------

## 0.6.0
- 剧情编辑三块面板可拖动

------

## 0.5.2

## 0.5.1
- 立绘关键帧移动
`;

test("splits every version section and keeps them in file order", () => {
  const sections = parseChangelog(SAMPLE);
  assert.deepEqual(
    sections.map((section) => section.version),
    ["0.6.1", "0.6.0", "0.5.2", "0.5.1"],
  );
});

test("keeps the heading suffix but never puts it into the notes", () => {
  const [first] = parseChangelog(SAMPLE);
  assert.equal(first.headingSuffix, "（未发布）");
  assert.ok(!first.notes.includes("未发布"), "heading text must not leak into the body");
});

test("drops the horizontal rules that separate sections", () => {
  const emptyLines = parseChangelog(SAMPLE).map((section) => section.notes.includes("------"));
  assert.deepEqual(emptyLines, [false, false, false, false]);
});

test('a section with no bullets becomes an empty string (not "undefined")', () => {
  const sections = parseChangelog(SAMPLE);
  const empty = sections.find((section) => section.version === "0.5.2");
  assert.equal(empty.notes, "");
});

test("handles CRLF input the same way", () => {
  const crlf = SAMPLE.replace(/\n/g, "\r\n");
  assert.deepEqual(
    parseChangelog(crlf).map((section) => section.notes),
    parseChangelog(SAMPLE).map((section) => section.notes),
  );
});

test("findSection accepts a v-prefixed tag and returns null when unknown", () => {
  const sections = parseChangelog(SAMPLE);
  assert.equal(findSection(sections, "v0.6.0").version, "0.6.0");
  assert.equal(findSection(sections, "0.6.0").version, "0.6.0");
  assert.equal(findSection(sections, "v9.9.9"), null);
});

test("stripTagPrefix only removes one leading v", () => {
  assert.equal(stripTagPrefix("v0.6.0"), "0.6.0");
  assert.equal(stripTagPrefix(" 0.6.0 "), "0.6.0");
  assert.equal(stripTagPrefix("vv0.6.0"), "v0.6.0");
});

test("release body = notes + the 'no need to uninstall' line", () => {
  const section = findSection(parseChangelog(SAMPLE), "0.6.0");
  const body = buildReleaseBody(section);
  assert.ok(body.startsWith("- 剧情编辑三块面板可拖动"), "notes must come first");
  assert.ok(body.includes("覆盖安装到原目录即可"));
});

test("changelog.json skips empty sections and sorts newest first", () => {
  const changelog = buildChangelogJson(parseChangelog(SAMPLE));
  assert.deepEqual(Object.keys(changelog), ["0.6.1", "0.6.0", "0.5.1"]);
  assert.ok(changelog["0.6.1"].includes("新增情绪动画"));
});

test("sortByVersionDesc compares numerically, not as strings", () => {
  const versions = sortByVersionDesc([{ version: "0.9.0" }, { version: "0.10.0" }, { version: "0.2.10" }]);
  assert.deepEqual(
    versions.map((section) => section.version),
    ["0.10.0", "0.9.0", "0.2.10"],
  );
});

// ---------------------------------------------------------------------------
// The real notes file: this is what CI feeds into the release body.
// ---------------------------------------------------------------------------

test("real docs/版本更新笔记.md parses into many sections", () => {
  const sections = parseChangelog(fs.readFileSync(REAL_NOTES, "utf8"));
  assert.ok(sections.length >= 10, `expected at least 10 versions, got ${sections.length}`);
  const versions = sections.map((section) => section.version);
  assert.ok(versions.includes("0.6.0"), "the unreleased section must be parseable");
  assert.ok(versions.includes("0.5.1"), "historical sections must survive");
});

test("the newest section in the real file actually has notes", () => {
  const sections = sortByVersionDesc(parseChangelog(fs.readFileSync(REAL_NOTES, "utf8")));
  const newest = sections[0];
  assert.ok(newest.notes.length > 100, `newest section (${newest.version}) looks empty`);
});

if (process.exitCode === 0) {
  console.log(`\nall ${passed} checks passed`);
}
