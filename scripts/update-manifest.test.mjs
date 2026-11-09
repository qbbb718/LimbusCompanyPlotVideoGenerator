#!/usr/bin/env node
/**
 * Self-test for demo/frontend/electron-react-app/public/update-manifest.js.
 *
 * Run: node scripts/update-manifest.test.mjs
 *
 * That module decides "is there a new version?" and "is this local installer really ours?".
 * When it is wrong nothing throws - the app just never offers an update, or always refuses a
 * perfectly good installer - so the format assumptions are pinned here with the exact shape
 * electron-builder writes (including CRLF and the top-level `sha512`/`releaseDate` keys).
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MANIFEST_MODULE = "../demo/frontend/electron-react-app/public/update-manifest.js";
const { parseVersion, compareVersions, parseLatestYml, findManifestFile, pickTarget } =
  require(MANIFEST_MODULE);

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

/** Verbatim shape of release/latest.yml produced by electron-builder 25 (NSIS, win x64). */
const REAL_LATEST_YML = `version: 0.5.1
files:
  - url: LCP0.5.1.exe
    sha512: zkVZaaoNM/OZpRf+3OP7IfgaE/6vI2LJ/hoa6LeW6XtBQrX2jFJF4S8z56LwU7GZz1P0iHEULYNj0WlFpuzYqg==
    size: 300653924
path: LCP0.5.1.exe
sha512: zkVZaaoNM/OZpRf+3OP7IfgaE/6vI2LJ/hoa6LeW6XtBQrX2jFJF4S8z56LwU7GZz1P0iHEULYNj0WlFpuzYqg==
releaseDate: '2026-11-09T14:57:19.765Z'
`;

test("parses the real latest.yml shape", () => {
  const manifest = parseLatestYml(REAL_LATEST_YML);
  assert.equal(manifest.version, "0.5.1");
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].url, "LCP0.5.1.exe");
  assert.equal(manifest.files[0].size, 300653924);
  assert.ok(manifest.files[0].sha512.startsWith("zkVZaaoNM"), "sha512 must be captured");
  assert.equal(manifest.path, "LCP0.5.1.exe");
});

test("parses the same content with CRLF line endings", () => {
  const manifest = parseLatestYml(REAL_LATEST_YML.replace(/\n/g, "\r\n"));
  assert.equal(manifest.version, "0.5.1");
  assert.equal(manifest.files[0].size, 300653924);
  assert.equal(manifest.path, "LCP0.5.1.exe");
});

test("the top-level sha512 is not mistaken for a second file", () => {
  const manifest = parseLatestYml(REAL_LATEST_YML);
  assert.equal(manifest.files.length, 1);
});

test("multiple files in the list are all captured", () => {
  const manifest = parseLatestYml(
    ["version: 0.6.0", "files:", "  - url: A.exe", "    sha512: aaa", "    size: 10", "  - url: B.exe", "    sha512: bbb", "    size: 20", "path: A.exe"].join("\n"),
  );
  assert.deepEqual(
    manifest.files.map((file) => [file.url, file.sha512, file.size]),
    [
      ["A.exe", "aaa", 10],
      ["B.exe", "bbb", 20],
    ],
  );
});

test("a manifest without version is reported as such (caller aborts that source)", () => {
  assert.equal(parseLatestYml("files:\n  - url: A.exe\n").version, null);
  assert.equal(parseLatestYml("").version, null);
});

test("parseVersion accepts only plain x.y.z", () => {
  assert.deepEqual(parseVersion("0.6.0"), [0, 6, 0]);
  assert.deepEqual(parseVersion(" 0.6.0 "), [0, 6, 0]);
  assert.equal(parseVersion("v0.6.0"), null);
  assert.equal(parseVersion("0.6"), null);
  assert.equal(parseVersion(""), null);
});

test("compareVersions compares numerically, not as strings", () => {
  assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
  assert.equal(compareVersions("0.6.0", "0.6.0"), 0);
  assert.equal(compareVersions("0.6.0", "0.6.1"), -1);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
  // 解析不了时当作"没法比较"，调用方会按"没有更新"处理
  assert.equal(compareVersions("abc", "0.6.0"), 0);
});

test("findManifestFile matches by basename, case-insensitively", () => {
  const manifest = parseLatestYml(REAL_LATEST_YML);
  assert.equal(findManifestFile(manifest, "LCP0.5.1.exe").size, 300653924);
  assert.equal(findManifestFile(manifest, "lcp0.5.1.EXE").size, 300653924);
  assert.equal(findManifestFile(manifest, "LCP9.9.9.exe"), null);
});

test("findManifestFile falls back to the top-level path for old manifests", () => {
  const manifest = { version: "0.5.1", files: [], path: "LCP0.5.1.exe" };
  assert.equal(findManifestFile(manifest, "LCP0.5.1.exe").url, "LCP0.5.1.exe");
});

test("pickTarget prefers the newest version even when a stale mirror answers faster", () => {
  const target = pickTarget(
    [
      { source: { id: "ghfast" }, manifest: { version: "0.6.0" }, elapsedMs: 100 },
      { source: { id: "github" }, manifest: { version: "0.6.1" }, elapsedMs: 3000 },
    ],
    "0.5.1",
  );
  assert.equal(target.source.id, "github");
  assert.equal(target.manifest.version, "0.6.1");
});

test("pickTarget prefers the faster source when versions tie", () => {
  const target = pickTarget(
    [
      { source: { id: "slow" }, manifest: { version: "0.6.1" }, elapsedMs: 5000 },
      { source: { id: "fast" }, manifest: { version: "0.6.1" }, elapsedMs: 200 },
    ],
    "0.5.1",
  );
  assert.equal(target.source.id, "fast");
});

test("pickTarget returns null when nothing is newer (already up to date)", () => {
  assert.equal(pickTarget([{ manifest: { version: "0.5.1" }, elapsedMs: 1 }], "0.5.1"), null);
  assert.equal(pickTarget([{ manifest: { version: "0.4.0" }, elapsedMs: 1 }], "0.5.1"), null);
  assert.equal(pickTarget([], "0.5.1"), null);
});

test("pickTarget ignores entries without a version", () => {
  assert.equal(pickTarget([{ manifest: {}, elapsedMs: 1 }], "0.5.1"), null);
});

if (process.exitCode === 0 || process.exitCode === undefined) {
  console.log(`\nall ${passed} checks passed`);
}
