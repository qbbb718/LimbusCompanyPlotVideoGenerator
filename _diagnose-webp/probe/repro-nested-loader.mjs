// 独立复现：造一个和 Spring Boot 可执行 jar 同形的嵌套 jar，用 URLClassLoader 从
// jar-in-jar 路径加载 WebpImageDecoder，看 JavaCPP 能不能把原生库释放出来。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const REPO = 'E:/LimbusCompanyPlotVideoGenerator';
const APP_CLASSES = path.join(REPO, 'demo/target/classes');
const TEST_CLASSES = path.join(REPO, 'demo/target/test-classes');
const M2 = path.join(os.homedir(), '.m2/repository');
const JAVACPP = path.join(M2, 'org/bytedeco/javacpp/1.5.9/javacpp-1.5.9-windows-x86_64.jar');
const FFMPEG = path.join(M2, 'org/bytedeco/ffmpeg/6.0-1.5.9/ffmpeg-6.0-1.5.9-windows-x86_64.jar');
const SLF4J_API = path.join(M2, 'org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar');
const SLF4J_SIMPLE = path.join(M2, 'org/slf4j/slf4j-simple/2.0.9/slf4j-simple-2.0.9.jar');

// 用 7z 风格的做法：把原生 jar 作为 STORED 条目写进外层 jar，再放 BOOT-INF/classes
// 这里手写一个最小 zip writer（Node 没有内置 zip）
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);      // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

const entries = [];
for (const [jar, label] of [[JAVACPP, 'javacpp'], [FFMPEG, 'ffmpeg']]) {
  entries.push({ name: `BOOT-INF/lib/${path.basename(jar)}`, data: fs.readFileSync(jar) });
}
for (const cls of [
  'com/lbc_plot/common/util/io/WebpImageDecoder.class',
  'com/lbc_plot/common/util/io/NativeLibraryBootstrap.class',
  'com/lbc_plot/common/util/io/WebpSelfCheck.class',
  'com/lbc_plot/common/util/FFmpegPathResolver.class',
]) {
  entries.push({ name: `BOOT-INF/classes/${cls}`, data: fs.readFileSync(path.join(APP_CLASSES, cls)) });
}
const outJar = path.join(REPO, '_diagnose-webp/probe/nested-loader/fake-boot-app.jar');
fs.mkdirSync(path.dirname(outJar), { recursive: true });
fs.writeFileSync(outJar, buildZip(entries));
console.log('wrote', outJar, fs.statSync(outJar).size);

const cacheDir = path.join(REPO, '_diagnose-webp/probe/nested-loader/cache');
fs.rmSync(cacheDir, { recursive: true, force: true });
fs.mkdirSync(cacheDir, { recursive: true });

const cp = [TEST_CLASSES, SLF4J_API, SLF4J_SIMPLE, outJar].join(';');
const java = 'C:/Program Files/Java/jdk-21/bin/java.exe';
const log = execFileSync(java, [
  `-Dlbc.probe.jar=${outJar}`,
  `-Dlbc.probe.cachedir=${cacheDir}`,
  '-cp', cp,
  'com.lbc_plot.common.util.io.LoaderProbe',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
console.log(log);
console.log('cache dir:', fs.readdirSync(cacheDir));
