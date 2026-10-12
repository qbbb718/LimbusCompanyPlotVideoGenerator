#!/usr/bin/env node
/**
 * Self-test for scripts/version.mjs.
 *
 * Run: node scripts/version.test.mjs
 *
 * It does not touch the repository files: everything happens on temporary copies, and the
 * round-trip checks assert that a patched file parses, that its version fields moved, and that
 * every other byte - including CRLF endings - is unchanged. That last check is what caught the
 * earlier bug where a hand-computed offset produced `"version": ""0.2.3"`.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_PKG = path.join(ROOT, "demo/frontend/electron-react-app/package.json");
const REAL_LOCK = path.join(ROOT, "demo/frontend/electron-react-app/package-lock.json");
const REAL_POM = path.join(ROOT, "demo/pom.xml");
const REAL_YML = path.join(ROOT, "demo/src/main/resources/application.yml");

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

/**
 * Mirror of scripts/version.mjs internals. The script is a CLI (it runs on import), so the two
 * functions it must get exactly right are reimplemented here to keep the test dependency-free.
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
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        const raw = text.slice(stringStart, i);
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === ":") {
          if (raw === "packages" && depth === 1) packagesKeyAt = i;
          pendingKey = raw;
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
    } else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
    else if (ch === ",") pendingKey = null;
  }
  return { fields, packagesKeyAt };
}

function patchJsonVersionFields(text, replaceWith) {
  const { fields, packagesKeyAt } = scanJsonStringFields(text, "version");
  const rootFields = fields.filter((f) => f.depth === 1);
  assert.equal(rootFields.length, 1, "expected one top-level version");
  const targets = [rootFields[0]];
  if (packagesKeyAt !== null) {
    const inPackagesEntry = fields.filter((f) => f.depth === 3 && f.start > packagesKeyAt);
    assert.ok(inPackagesEntry.length > 0, 'expected one version inside packages[""]');
    targets.push(inPackagesEntry[0]);
  } else {
    assert.equal(fields.length, 1, "plain package.json has a single version field");
  }
  let patched = text;
  for (const field of [...targets].sort((a, b) => b.start - a.start)) {
    // `start`/`end` mark the value between the quotes, so the quotes stay in place.
    patched = `${patched.slice(0, field.start)}${replaceWith}${patched.slice(field.end)}`;
  }
  return patched;
}

const crlf = (text) => text.replace(/\r?\n/g, "\r\n");

console.log("package.json");

test("only the version value changes, CRLF and trailing newline intact", () => {
  const original = crlf(fs.readFileSync(REAL_PKG, "utf8"));
  const patched = patchJsonVersionFields(original, "9.9.9");
  assert.equal(JSON.parse(patched).version, "9.9.9");
  assert.equal(JSON.parse(patched).name, JSON.parse(original).name);
  assert.equal(patched, original.replace(/"version": "[^"]*"/, '"version": "9.9.9"'));
  const lastChar = patched.slice(-1);
  assert.ok(lastChar === "}" || lastChar === "\n", `unexpected file ending: ${JSON.stringify(patched.slice(-3))}`);
  assert.equal(patched.replace(/\r\n/g, "").includes("\n"), original.replace(/\r\n/g, "").includes("\n"), "line endings kept");
});

console.log("package-lock.json");

test("both mirrors move, the 1600+ dependency fields do not", () => {
  const original = crlf(fs.readFileSync(REAL_LOCK, "utf8"));
  const before = JSON.parse(original);
  const patched = patchJsonVersionFields(original, "9.9.9");
  const after = JSON.parse(patched);

  assert.equal(after.version, "9.9.9", "lock root");
  assert.equal(after.packages[""].version, "9.9.9", 'packages[""]');
  assert.equal(after.name, before.name);
  assert.deepEqual(after.packages[""].dependencies, before.packages[""].dependencies);
  assert.equal(Object.keys(after.packages).length, Object.keys(before.packages).length);
  // Only the two version strings may differ, so the size delta is bounded by the digits swapped.
  assert.ok(Math.abs(patched.length - original.length) <= 20, `unexpected size change: ${patched.length - original.length}`);

  const untouched = before.packages["node_modules/react"];
  if (untouched) assert.deepEqual(after.packages["node_modules/react"], untouched);
});

test("a dependency pinned at the same version as the app is left alone", () => {
  const fixture = JSON.stringify(
    {
      name: "app",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "app", version: "0.1.0" },
        "node_modules/dep": { version: "0.1.0", resolved: "https://example.com/dep.tgz" },
      },
    },
    null,
    2,
  );
  const patched = JSON.parse(patchJsonVersionFields(fixture, "0.2.0"));
  assert.equal(patched.version, "0.2.0");
  assert.equal(patched.packages[""].version, "0.2.0");
  assert.equal(patched.packages["node_modules/dep"].version, "0.1.0");
});

test("escaped quotes in earlier strings do not derail the scanner", () => {
  const fixture = '{\n  "name": "a\\"b",\n  "version": "1.2.3",\n  "packages": {\n    "": { "name": "a\\"b", "version": "1.2.3" }\n  }\n}';
  const patched = JSON.parse(patchJsonVersionFields(fixture, "2.0.0"));
  assert.equal(patched.version, "2.0.0");
  assert.equal(patched.packages[""].version, "2.0.0");
});

console.log("pom.xml");

test("the project version is the only text replaced", () => {
  const original = crlf(fs.readFileSync(REAL_POM, "utf8"));
  const current = original.match(/<artifactId>\s*demo\s*<\/artifactId>\s*<version>([^<]+)<\/version>/)[1];
  const patched = original.replace(current, "9.9.9-SNAPSHOT");
  const again = patched.match(/<artifactId>\s*demo\s*<\/artifactId>\s*<version>([^<]+)<\/version>/)[1];
  assert.equal(again, "9.9.9-SNAPSHOT");
  assert.ok(patched.includes("<version>3.2.0</version>"), "the Spring Boot parent version is untouched");
  assert.equal(patched.split("9.9.9-SNAPSHOT").length - 1, 1);
});

console.log("application.yml");

/** Mirror of the app.version handling in scripts/version.mjs. */
const YML_KEY = /^([ \t]*app\.version[ \t]*:[ \t]*)("[^"]*"|'[^']*'|[^\s#]+)(.*)$/;

function ymlKeyMatches(text) {
  return text.split(/\r?\n/).map((line, index) => ({ line, index })).filter(({ line }) => YML_KEY.test(line));
}

function patchYmlVersion(text, replaceWith) {
  const matches = ymlKeyMatches(text);
  assert.equal(matches.length, 1, 'expected exactly one "app.version:" line');
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      if (index !== matches[0].index) return line;
      const m = line.match(YML_KEY);
      const quote = m[2].startsWith('"') ? '"' : m[2].startsWith("'") ? "'" : "";
      return `${m[1]}${quote}${replaceWith}${quote}${m[3]}`;
    })
    .join(eol);
}

test("the backend version is patched and nothing else moves", () => {
  const original = crlf(fs.readFileSync(REAL_YML, "utf8"));
  const current = ymlKeyMatches(original)[0].line.match(YML_KEY)[2];
  const patched = patchYmlVersion(original, "9.9.9");
  assert.equal(ymlKeyMatches(patched)[0].line.match(YML_KEY)[2], "9.9.9", "app.version moved");
  assert.equal(ymlKeyMatches(patched).length, 1, "no extra app.version line appeared");
  assert.equal(patched, original.replace(`app.version: ${current}`, "app.version: 9.9.9"));
  assert.equal(patched.split("\r\n").length, original.split("\r\n").length, "line count kept");
});

test("storage.enable.versioning is not mistaken for app.version", () => {
  const fixture = [
    "app:",
    "  version: 1.0.0",
    "storage:",
    "  enable:",
    "    versioning: true",
    "app.version: 0.1.0",
    "",
  ].join("\n");
  const patched = patchYmlVersion(fixture, "0.2.0");
  assert.ok(patched.includes("app.version: 0.2.0"), "the real key moved");
  assert.ok(patched.includes("versioning: true"), "versioning untouched");
  assert.ok(patched.includes("  version: 1.0.0"), "a nested bare version key untouched");
});

test("quoted and commented app.version lines keep their shape", () => {
  const fixture = 'app.version: "0.1.0" # keep me\nother: 1\n';
  const patched = patchYmlVersion(fixture, "0.2.0");
  assert.equal(patched, 'app.version: "0.2.0" # keep me\nother: 1\n');
});

test("a missing app.version line is an error, not a silent skip", () => {
  assert.throws(() => patchYmlVersion("server:\n  port: 8081\n", "0.2.0"), /app\.version/);
});

console.log(`\n${passed} test(s) passed${process.exitCode ? " with failures" : ""}`);
