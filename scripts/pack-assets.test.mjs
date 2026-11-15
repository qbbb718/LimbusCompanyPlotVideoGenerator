#!/usr/bin/env node
/**
 * Self-test for scripts/pack-assets.mjs.
 *
 * Run: node scripts/pack-assets.test.mjs
 *
 * Everything happens in throw-away temp folders: the test fakes a demo tree
 * (`<tmp>/demo/assets` + `<tmp>/demo/data`, standing in for the curated sources) and a data root
 * (`<tmp>/data-root/assets/...` + `data/project.db`), then asserts what `demo/pack` contains.
 *
 * The properties worth pinning down are the ones that produce a broken or surprising installer:
 *
 *   - the payload is curated + dev, and a dev file with the same path wins (deterministic,
 *     sequential copy - see the header of pack-assets.mjs for why two extraResources entries
 *     were abandoned);
 *   - the curated character folders survive the dev overlay instead of being replaced;
 *   - the payload is rebuilt, so a character deleted locally does not come back from an older
 *     copy, and a checkpointed `-wal` does not linger;
 *   - no local data root (the CI case) still yields a complete curated payload, exit code 0;
 *   - a truncated / non-SQLite project.db is refused *before* the previous payload is deleted;
 *   - `rm -rf` targets are guarded: never the repository, the demo folder, or the curated
 *     assets, and never a folder this script did not create.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_ASSET_DIRS,
  MARKER_FILE,
  assertSafeOutDir,
  buildPayload,
  defaultDataRoot,
  formatBytes,
  isSafeFolderName,
  parseArgs,
  planPayload,
  readDataLocationHint,
  resolveDataRoot,
} from "./pack-assets.mjs";

const SQLITE_HEADER = Buffer.concat([Buffer.from("SQLite format 3", "latin1"), Buffer.from([0])]);

let passed = 0;
const tests = [];

/** Register one test; `fn` may be async. */
const test = (name, fn) => tests.push({ name, fn });

/* ==================== fixtures ==================== */

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lcb-pack-assets-"));
  tempDirs.push(dir);
  return dir;
}

/** Write a file, creating parent folders. */
function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/**
 * One scratch repository: a demo folder (curated sources) and a data root (local dev output).
 *
 * @returns {{repo: string, demo: string, dataRoot: string, out: string}}
 */
function makeFixture() {
  const repo = makeTempDir();
  const demo = path.join(repo, "demo");
  const dataRoot = path.join(repo, "data-root");

  // ---- curated set (what demo/assets + demo/data look like in the repository) ----
  write(path.join(demo, "assets/ui/border_1080p.png"), "border");
  write(path.join(demo, "assets/fonts/ChineseFont.ttf"), "font");
  write(path.join(demo, "assets/effects/speech_bubble/a.png"), "effect");
  // A shipped character, and a folder only the curated set has.
  write(path.join(demo, "assets/characters/char_1785997936961/portrait_1.png"), "curated-portrait");
  write(path.join(demo, "assets/characters/01李箱/李箱-default.webp"), "webp");
  write(path.join(demo, "assets/thumbnails/thumb_bg.jpg"), "curated-thumb");
  write(path.join(demo, "data/project.db"), Buffer.concat([SQLITE_HEADER, Buffer.from("curated-db")]));
  write(path.join(demo, "data/records.json"), "[curated-records]");

  // ---- data root (what a local dev session produces) ----
  write(path.join(dataRoot, "assets/characters/char_1785997936961/portrait_1.png"), "DEV-portrait");
  write(path.join(dataRoot, "assets/characters/char_1794319835668/portrait_9.png"), "dev-portrait");
  write(path.join(dataRoot, "assets/characters/Rodion-default.png"), "loose-file");
  write(path.join(dataRoot, "assets/animation-clips/joy_879832bc/clip.json"), '{"id":"joy_879832bc"}');
  write(path.join(dataRoot, "assets/animation-clips/joy_879832bc/frames/0001.png"), "frame");
  write(path.join(dataRoot, "assets/backgrounds/dev-bg.png"), "not-overlaid-by-default");
  write(path.join(dataRoot, "data/project.db"), Buffer.concat([SQLITE_HEADER, Buffer.from("DEV-db")]));
  write(path.join(dataRoot, "data/project.db-wal"), "wal");
  write(path.join(dataRoot, "data/project.db-shm"), "shm");

  return { repo, demo, dataRoot, out: path.join(demo, "pack") };
}

/** Recursively list files, relative and slash separated, sorted. */
function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(dir, full).replace(/\\/g, "/"));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

/** Build the payload for a fixture. */
function build(fixture, extra = {}) {
  return buildPayload({
    baseDir: fixture.demo,
    outDir: fixture.out,
    dataRoot: fixture.dataRoot,
    repoRoot: fixture.repo,
    log: () => {},
    ...extra,
  });
}

/* ==================== argument parsing ==================== */

test("defaults: every default dev folder, database on, full profile, <base>/pack payload", () => {
  const options = parseArgs([]);
  assert.deepEqual(options.assetDirs, DEFAULT_ASSET_DIRS);
  assert.equal(options.database, true);
  assert.equal(options.dataRoot, null);
  assert.equal(options.outDir, null);
  assert.equal(options.dryRun, false);
  assert.equal(options.requireSource, false);
  assert.equal(options.force, false);
  assert.equal(options.profile, "full");
});

test("--lite / --profile select the small variant, --profile validates its value", () => {
  assert.equal(parseArgs(["--lite"]).profile, "lite");
  assert.equal(parseArgs(["--profile", "lite"]).profile, "lite");
  assert.equal(parseArgs(["--profile", "full"]).profile, "full");
  assert.throws(() => parseArgs(["--profile", "tiny"]), /must be full or lite/);
});

test("--assets cannot be combined with --lite", () => {
  assert.throws(
    () => parseArgs(["--lite", "--assets", "characters"]),
    /cannot be combined with --lite/,
  );
});

test("--assets replaces the list and tolerates spaces", () => {
  assert.deepEqual(parseArgs(["--assets", " characters , backgrounds "]).assetDirs, [
    "characters",
    "backgrounds",
  ]);
});

test("--data-root / --base-dir / --out / --no-database / --dry-run / --force", () => {
  const options = parseArgs([
    "--data-root",
    "D:/SOFTWARE/LCP",
    "--base-dir",
    "E:/repo/demo",
    "--out",
    "E:/repo/demo/pack",
    "--no-database",
    "--dry-run",
    "--require-source",
    "--force",
  ]);
  assert.equal(options.dataRoot, "D:/SOFTWARE/LCP");
  assert.equal(options.baseDir, path.resolve("E:/repo/demo"));
  assert.equal(options.outDir, path.resolve("E:/repo/demo/pack"));
  assert.equal(options.database, false);
  assert.equal(options.dryRun, true);
  assert.equal(options.requireSource, true);
  assert.equal(options.force, true);
});

test("unknown arguments and missing values are rejected", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
  assert.throws(() => parseArgs(["--data-root"]), /missing value/);
  assert.throws(() => parseArgs(["--assets", ""]), /empty list/);
});

test("dev folder names that could escape the payload folder are rejected", () => {
  for (const bad of ["..", ".", "../assets", "a/b", "a\\b", "C:"]) {
    assert.equal(isSafeFolderName(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.throws(() => parseArgs(["--assets", bad]), /invalid asset folder name/);
  }
  for (const good of ["characters", "animation-clips", "thumbnails", "effects_2"]) {
    assert.equal(isSafeFolderName(good), true, `expected ${good} to be accepted`);
  }
});

/* ==================== data root resolution ==================== */

test("data root priority: --data-root > LBC_DATA_DIR > platform default", () => {
  const env = { APPDATA: "C:/Users/me/AppData/Roaming", LBC_DATA_DIR: "E:/from-env" };
  assert.deepEqual(resolveDataRoot({ dataRoot: "D:/from-cli", env }), {
    dataRoot: path.resolve("D:/from-cli"),
    source: "cli",
  });
  assert.deepEqual(resolveDataRoot({ env }), { dataRoot: path.resolve("E:/from-env"), source: "env" });
  assert.deepEqual(resolveDataRoot({ env: { APPDATA: "C:/Users/me/AppData/Roaming" } }), {
    dataRoot: path.join("C:/Users/me/AppData/Roaming", "limbus-company-plot-video-generator"),
    source: "default",
  });
});

test("default data root mirrors RuntimePaths on every platform", () => {
  assert.equal(
    defaultDataRoot({ APPDATA: "C:/Users/me/AppData/Roaming" }),
    path.join("C:/Users/me/AppData/Roaming", "limbus-company-plot-video-generator"),
  );
  assert.equal(
    defaultDataRoot({}),
    path.join(os.homedir(), ".limbus-company-plot-video-generator"),
  );
});

test("data-location.json hint is read, BOM tolerated, garbage ignored", () => {
  const root = makeTempDir();
  assert.equal(readDataLocationHint(root), null, "no file yet");

  fs.writeFileSync(
    path.join(root, "data-location.json"),
    `\uFEFF{"dataRoot":"D:\\\\SOFTWARE\\\\LCP","savedAt":"x"}`,
    "utf8",
  );
  assert.deepEqual(readDataLocationHint(root), {
    dataRoot: "D:\\SOFTWARE\\LCP",
    configFile: path.join(root, "data-location.json"),
  });

  fs.writeFileSync(path.join(root, "data-location.json"), "{not json", "utf8");
  assert.equal(readDataLocationHint(root), null);
});

/* ==================== planning ==================== */

test("plan: reports curated sources, dev entries and the -wal companion", () => {
  const fixture = makeFixture();
  const plan = planPayload({ dataRoot: fixture.dataRoot, baseDir: fixture.demo });

  assert.equal(plan.devAvailable, true);
  assert.equal(plan.curated.assets.exists, true);
  assert.equal(plan.curated.assets.files, 6);
  assert.deepEqual(
    plan.dev.assets.map((item) => [item.name, item.present, item.files]),
    [
      ["characters", true, 3],
      ["animation-clips", true, 2],
      ["thumbnails", false, 0],
    ],
  );
  assert.deepEqual(
    plan.dev.data.map((item) => item.name),
    ["project.db", "project.db-wal"],
    "records.json is absent locally, the -shm must never be packaged",
  );
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /project\.db-wal/);
});

test("plan: a missing data root is reported, not thrown", () => {
  const fixture = makeFixture();
  const plan = planPayload({
    dataRoot: path.join(fixture.repo, "no-such-root"),
    baseDir: fixture.demo,
  });
  assert.equal(plan.devAvailable, false);
  assert.match(plan.reason, /data root not found/);
});

test("plan: backgrounds are not overlaid unless asked for", () => {
  const fixture = makeFixture();
  const plan = planPayload({ dataRoot: fixture.dataRoot, baseDir: fixture.demo });
  assert.equal(
    plan.dev.assets.some((item) => item.name === "backgrounds"),
    false,
  );
});

test("plan: the lite profile only lists ui/effects/fonts and never reads the data root", () => {
  const fixture = makeFixture();
  const plan = planPayload({
    dataRoot: fixture.dataRoot,
    baseDir: fixture.demo,
    profile: "lite",
  });
  assert.equal(plan.profile, "lite");
  assert.deepEqual(
    plan.lite.map((item) => [item.name, item.present]),
    [
      ["ui", true],
      ["effects", true],
      ["fonts", true],
    ],
  );
  assert.deepEqual(plan.dev.assets, [], "no dev overlay in the lite profile");
  assert.deepEqual(plan.dev.data, [], "no database in the lite profile");
  assert.match(plan.reason, /lite profile/);
});

/* ==================== payload contents ==================== */

test("payload = curated + dev, dev wins on the same relative path", async () => {
  const fixture = makeFixture();
  await build(fixture);

  const assets = path.join(fixture.out, "assets");
  assert.deepEqual(listFiles(assets), [
    "animation-clips/joy_879832bc/clip.json",
    "animation-clips/joy_879832bc/frames/0001.png",
    "characters/01李箱/李箱-default.webp",
    "characters/Rodion-default.png",
    "characters/char_1785997936961/portrait_1.png",
    "characters/char_1794319835668/portrait_9.png",
    "effects/speech_bubble/a.png",
    "fonts/ChineseFont.ttf",
    "thumbnails/thumb_bg.jpg",
    "ui/border_1080p.png",
  ]);
  assert.equal(
    fs.readFileSync(path.join(assets, "characters/char_1785997936961/portrait_1.png"), "utf8"),
    "DEV-portrait",
    "the dev version of an already-shipped character must win",
  );
  assert.equal(
    fs.readFileSync(path.join(assets, "characters/01李箱/李箱-default.webp"), "utf8"),
    "webp",
    "curated characters must survive the dev overlay",
  );
  assert.equal(
    fs.existsSync(path.join(assets, "backgrounds")),
    false,
    "backgrounds are not part of the default overlay",
  );
});

test("payload data = curated files with the dev database on top", async () => {
  const fixture = makeFixture();
  await build(fixture);

  const data = path.join(fixture.out, "data");
  assert.deepEqual(listFiles(data), ["project.db", "project.db-wal", "records.json"]);
  assert.match(
    fs.readFileSync(path.join(data, "project.db"), "latin1"),
    /DEV-db$/,
    "the local database must replace the curated one",
  );
  assert.equal(
    fs.readFileSync(path.join(data, "records.json"), "utf8"),
    "[curated-records]",
    "a data file the data root does not have keeps the curated version",
  );
  assert.equal(fs.existsSync(path.join(data, "project.db-shm")), false);
});

test("lite payload is ui/effects/fonts only: no dev content, no curated extras, no database", async () => {
  const fixture = makeFixture();
  await build(fixture, { profile: "lite" });

  assert.deepEqual(listFiles(path.join(fixture.out, "assets")), [
    "effects/speech_bubble/a.png",
    "fonts/ChineseFont.ttf",
    "ui/border_1080p.png",
  ]);
  assert.equal(
    fs.existsSync(path.join(fixture.out, "data")),
    false,
    "the lite installer ships no starter database (the backend creates an empty one)",
  );
  assert.equal(
    fs.existsSync(path.join(fixture.out, "assets/characters")),
    false,
    "the data root has characters, but the lite profile must ignore it",
  );
  assert.equal(fs.existsSync(path.join(fixture.out, "assets/animation-clips")), false);
});

test("lite manifest marks the profile and counts no data files", async () => {
  const fixture = makeFixture();
  const { manifest } = await build(fixture, { profile: "lite" });
  const onDisk = JSON.parse(fs.readFileSync(path.join(fixture.out, "manifest.json"), "utf8"));

  assert.equal(onDisk.profile, "lite");
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(manifest)));
  assert.equal(onDisk.totalAssetFiles, 3);
  assert.equal(onDisk.totalDataFiles, 0);
  assert.deepEqual(onDisk.data, []);
});

test("the two profiles can be rebuilt in either order without leftovers", async () => {
  const fixture = makeFixture();
  await build(fixture);
  await build(fixture, { profile: "lite" });
  assert.deepEqual(listFiles(path.join(fixture.out, "assets")), [
    "effects/speech_bubble/a.png",
    "fonts/ChineseFont.ttf",
    "ui/border_1080p.png",
  ]);

  await build(fixture);
  assert.equal(fs.existsSync(path.join(fixture.out, "data/project.db")), true);
  assert.equal(fs.existsSync(path.join(fixture.out, "assets/characters")), true);
});

test("a lite payload without the curated ui folder is a hard error", async () => {
  const fixture = makeFixture();
  fs.rmSync(path.join(fixture.demo, "assets/ui"), { recursive: true });
  await assert.rejects(build(fixture, { profile: "lite" }), /curated assets are missing/);
});


test("payload carries the manifest electron-builder does not package", async () => {
  const fixture = makeFixture();
  const { manifest } = await build(fixture);
  const onDisk = JSON.parse(fs.readFileSync(path.join(fixture.out, "manifest.json"), "utf8"));

  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(manifest)));
  assert.equal(onDisk.profile, "full");
  assert.equal(onDisk.devAvailable, true);
  assert.equal(onDisk.dataRoot, path.resolve(fixture.dataRoot));
  assert.equal(onDisk.totalAssetFiles, 10);
  assert.equal(onDisk.totalDataFiles, 3);
  assert.deepEqual(
    onDisk.assets.find((item) => item.name === "characters").entries,
    ["char_1785997936961", "char_1794319835668"],
    "dev character ids are auditable",
  );
  assert.ok(fs.existsSync(path.join(fixture.out, MARKER_FILE)));
});

test("payload is rebuilt: a character deleted locally disappears", async () => {
  const fixture = makeFixture();
  await build(fixture);
  assert.ok(fs.existsSync(path.join(fixture.out, "assets/characters/char_1794319835668")));

  fs.rmSync(path.join(fixture.dataRoot, "assets/characters/char_1794319835668"), {
    recursive: true,
  });
  await build(fixture);

  assert.equal(
    fs.existsSync(path.join(fixture.out, "assets/characters/char_1794319835668")),
    false,
  );
  assert.ok(fs.existsSync(path.join(fixture.out, "assets/characters/char_1785997936961")));
});

test("payload is rebuilt: a stale file in the payload folder is dropped", async () => {
  const fixture = makeFixture();
  await build(fixture);
  write(path.join(fixture.out, "assets/characters/ghost/ghost.png"), "stale");

  await build(fixture);
  assert.equal(fs.existsSync(path.join(fixture.out, "assets/characters/ghost")), false);
});

test("payload is rebuilt: a checkpointed WAL does not linger", async () => {
  const fixture = makeFixture();
  await build(fixture);
  assert.ok(fs.existsSync(path.join(fixture.out, "data/project.db-wal")));

  fs.rmSync(path.join(fixture.dataRoot, "data/project.db-wal"));
  await build(fixture);

  assert.deepEqual(listFiles(path.join(fixture.out, "data")), ["project.db", "records.json"]);
});

test("building twice is idempotent", async () => {
  const fixture = makeFixture();
  await build(fixture);
  const first = listFiles(fixture.out);
  await build(fixture);
  assert.deepEqual(listFiles(fixture.out), first);
});

test("no local data root: the curated payload is still complete (the CI case)", async () => {
  const fixture = makeFixture();
  const lines = [];
  const { manifest } = await buildPayload({
    baseDir: fixture.demo,
    outDir: fixture.out,
    dataRoot: path.join(fixture.repo, "data-root-does-not-exist"),
    repoRoot: fixture.repo,
    log: (line) => lines.push(line),
  });

  assert.equal(manifest.devAvailable, false);
  assert.match(lines.join("\n"), /packaging the curated demo\/assets \+ demo\/data set only/);
  assert.deepEqual(listFiles(path.join(fixture.out, "assets")), [
    "characters/01李箱/李箱-default.webp",
    "characters/char_1785997936961/portrait_1.png",
    "effects/speech_bubble/a.png",
    "fonts/ChineseFont.ttf",
    "thumbnails/thumb_bg.jpg",
    "ui/border_1080p.png",
  ]);
  assert.deepEqual(listFiles(path.join(fixture.out, "data")), ["project.db", "records.json"]);
  assert.match(fs.readFileSync(path.join(fixture.out, "data/project.db"), "latin1"), /curated-db$/);
});

test("no local data root + --require-source fails instead of shipping a quiet partial set", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    buildPayload({
      baseDir: fixture.demo,
      outDir: fixture.out,
      dataRoot: path.join(fixture.repo, "nope"),
      repoRoot: fixture.repo,
      requireSource: true,
      log: () => {},
    }),
    /data root not found/,
  );
});

test("--no-database keeps the curated database and drops a previously staged dev one", async () => {
  const fixture = makeFixture();
  await build(fixture);
  assert.match(fs.readFileSync(path.join(fixture.out, "data/project.db"), "latin1"), /DEV-db$/);

  await build(fixture, { database: false });

  assert.deepEqual(listFiles(path.join(fixture.out, "data")), ["project.db", "records.json"]);
  assert.match(fs.readFileSync(path.join(fixture.out, "data/project.db"), "latin1"), /curated-db$/);
  assert.equal(fs.existsSync(path.join(fixture.out, "data/project.db-wal")), false);
  assert.ok(fs.existsSync(path.join(fixture.out, "assets/animation-clips")));
});

test("--dry-run reports the plan and changes nothing", async () => {
  const fixture = makeFixture();
  const lines = [];
  const { manifest } = await buildPayload({
    baseDir: fixture.demo,
    outDir: fixture.out,
    dataRoot: fixture.dataRoot,
    repoRoot: fixture.repo,
    dryRun: true,
    log: (line) => lines.push(line),
  });

  assert.equal(fs.existsSync(fixture.out), false, "the payload folder must not be created");
  assert.equal(manifest.dryRun, true);
  assert.match(lines.join("\n"), /would build/);
});

test("a curated assets folder that is missing is a hard error", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    buildPayload({
      baseDir: path.join(fixture.repo, "no-demo-here"),
      outDir: fixture.out,
      dataRoot: fixture.dataRoot,
      repoRoot: fixture.repo,
      log: () => {},
    }),
    /curated assets folder is missing/,
  );
});

/* ==================== safety ==================== */

test("a non-SQLite project.db is refused before the previous payload is deleted", async () => {
  const fixture = makeFixture();
  await build(fixture);
  const previous = listFiles(fixture.out);

  fs.writeFileSync(path.join(fixture.dataRoot, "data/project.db"), "definitely not a database");
  await assert.rejects(build(fixture), /not a SQLite database/);
  assert.deepEqual(listFiles(fixture.out), previous, "the last good payload survives");
});

test("an empty project.db is refused", async () => {
  const fixture = makeFixture();
  fs.writeFileSync(path.join(fixture.dataRoot, "data/project.db"), "");
  await assert.rejects(build(fixture), /is empty/);
});

test("the payload folder may never be the repository, the demo folder or a curated source", () => {
  const fixture = makeFixture();
  const repoRoot = fixture.repo;
  const baseDir = fixture.demo;

  for (const bad of [
    repoRoot,
    path.join(baseDir, "assets"),
    path.join(baseDir, "data"),
    path.join(baseDir, "assets", "characters"),
    path.join(repoRoot, "outside-project", "..", "..", "definitely-outside"),
  ]) {
    assert.throws(
      () => assertSafeOutDir(bad, { baseDir, repoRoot, force: true }),
      /refusing to use/,
      `expected ${bad} to be refused`,
    );
  }
  // Containing the demo folder is just as bad as being one of the curated sources.
  assert.throws(
    () => assertSafeOutDir(fixture.repo, { baseDir, repoRoot, force: true }),
    /refusing to use/,
  );
  assert.doesNotThrow(() => assertSafeOutDir(fixture.out, { baseDir, repoRoot }));
});

test("an unknown non-empty folder is not wiped without --force", async () => {
  const fixture = makeFixture();
  const foreign = path.join(fixture.demo, "scripts");
  write(path.join(foreign, "important.ps1"), "keep me");

  await assert.rejects(build(fixture, { outDir: foreign }), /refusing to rebuild/);
  assert.ok(fs.existsSync(path.join(foreign, "important.ps1")));

  await build(fixture, { outDir: foreign, force: true });
  assert.equal(fs.existsSync(path.join(foreign, "important.ps1")), false);
  assert.ok(fs.existsSync(path.join(foreign, "assets")));
});

test("formatBytes stays readable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(508 * 1024 * 1024), "508 MB");
});

/* ==================== runner ==================== */

for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

for (const dir of tempDirs) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // A locked temp folder is not worth failing the self-test over.
  }
}

console.log(`\n${passed}/${tests.length} passed`);
