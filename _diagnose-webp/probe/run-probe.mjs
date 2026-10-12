// 探针：用安装版同样的启动方式（java -jar，Spring Boot 嵌套 jar）验证 WebP 立绘能否解码。
//
// 目的：本地 `mvn spring-boot:run` / 扁平 classpath 永远复现不了“红色加载失败方块”，
// 因为那种方式下 JavaCPP 的原生 jar 是磁盘上的真实文件。这里必须用 `java -jar`。
//
// 用法：node run-probe.mjs <jarPath> <tag>
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const BASE = 'E:/LimbusCompanyPlotVideoGenerator/_diagnose-webp/probe';
const JAVA = 'C:/Program Files/Java/jdk-21/bin/java.exe';

const jarPath = process.argv[2];
const tag = process.argv[3] ?? 'probe';
if (!jarPath) {
  console.error('usage: node run-probe.mjs <jarPath> <tag>');
  process.exit(2);
}

const home = path.join(BASE, `home-${tag}`);
const dataRoot = path.join(BASE, `data-${tag}`);
const charDir = path.join(dataRoot, 'assets', 'characters', 'char_probe');
const webpSrc = 'E:/LimbusCompanyPlotVideoGenerator/输出测试/WebP发红报错/巴里-default.webp';

// 每次都用全新的 home（JavaCPP 缓存目录也随之全新），排除“旧缓存碰巧可用”的假阳性
fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(charDir, { recursive: true });
fs.mkdirSync(path.join(dataRoot, 'assets', 'backgrounds'), { recursive: true });
fs.mkdirSync(path.join(dataRoot, 'data'), { recursive: true });
fs.copyFileSync(webpSrc, path.join(charDir, 'portrait_probe.webp'));

const port = 18081;
const logPath = path.join(BASE, `${tag}.app.log`);
const out = createWriteStream(logPath);

const started = Date.now();
const child = spawn(JAVA, [
  `-Duser.home=${home}`,
  `-Dlbc.data.dir=${dataRoot}`,
  `-Dfile.encoding=UTF-8`,
  `-jar`, jarPath,
  `--server.port=${port}`,
], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(out);
child.stderr.pipe(out);

const get = (url) => new Promise((resolve) => {
  http.get(url, { timeout: 3000 }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); resolve(null); });
});

const post = (url, payload) => new Promise((resolve) => {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const req = http.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length },
    timeout: 60000,
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', (e) => resolve({ status: 0, body: String(e) }));
  req.write(data);
  req.end();
});

const health = await (async () => {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) return null;
    const r = await get(`http://127.0.0.1:${port}/api/health`);
    if (r) return Date.now();
    await new Promise((r2) => setTimeout(r2, 500));
  }
  return null;
})();

const bootMs = health ? health - started : null;
let postStatus = 'n/a';

if (health) {
  const payload = {
    characterID: 'char_probe',
    characterName: 'PROBE',
    faction: '无阵营',
    portraits: [{
      portraitID: 'p_probe',
      characterID: 'char_probe',
      imagePath: 'char_probe/portrait_probe.webp',
      portName: 'probe',
      emotionName: 'NORMAL',
    }],
  };
  const created = await post(`http://127.0.0.1:${port}/api/characters`, payload);
  postStatus = created.status;
  // GET 会走 Portrait 懒加载 -> ImageReader.readCharacters -> WebpImageDecoder
  await get(`http://127.0.0.1:${port}/api/characters`);
  await new Promise((r) => setTimeout(r, 1500));
}

child.kill();
await new Promise((r) => setTimeout(r, 1200));
out.end();
await new Promise((r) => setTimeout(r, 300));
process.stderr.write(`[probe] exitCode=${child.exitCode} signal=${child.signalCode}\n`);

const text = fs.readFileSync(logPath, 'utf8');
const pick = (re) => text.split(/\r?\n/).filter((l) => re.test(l)).map((l) => l.trim());
const evidence = {
  tag,
  jar: jarPath,
  bootMs,
  postStatus,
  decoded: pick(/已用 FFmpeg 解码 WebP/).slice(0, 3),
  decodeFailed: pick(/WebpImageDecoder - (FFmpeg 解码图片失败|图片解码失败)/).slice(0, 4),
  portraitNull: pick(/构建 Portrait 时 readCharacters 返回 null/).slice(0, 2),
  nativeError: pick(/FFmpeg 原生库不可用/).slice(0, 3),
  causedBy: pick(/caused by:/).slice(0, 6),
  cacheDir: pick(/JavaCPP 缓存目录/).slice(0, 2),
};
console.log(JSON.stringify(evidence, null, 2));
