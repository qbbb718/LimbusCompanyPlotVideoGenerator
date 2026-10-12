// 端到端验证 WebP 立绘入库转换：用真实的打包 jar + 真实 HTTP 接口上传一张 WebP，
// 然后检查磁盘上落的是 PNG、原图是否备份、数据库里存的路径是否为 .png。
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const BASE = 'E:/LimbusCompanyPlotVideoGenerator/_diagnose-webp/probe';
const JAVA = 'C:/Program Files/Java/jdk-21/bin/java.exe';
const jarPath = process.argv[2];
const tag = process.argv[3] ?? 'convert';

const home = path.join(BASE, `home-${tag}`);
const dataRoot = path.join(BASE, `data-${tag}`);
const webpSrc = 'E:/LimbusCompanyPlotVideoGenerator/输出测试/WebP发红报错/巴里-default.webp';

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(dataRoot, 'assets', 'characters'), { recursive: true });
fs.mkdirSync(path.join(dataRoot, 'assets', 'backgrounds'), { recursive: true });
fs.mkdirSync(path.join(dataRoot, 'data'), { recursive: true });

const port = 18083;
const logPath = path.join(BASE, `${tag}.app.log`);
const out = createWriteStream(logPath);
const child = spawn(JAVA, [
  `-Duser.home=${home}`, `-Dlbc.data.dir=${dataRoot}`, '-Dfile.encoding=UTF-8',
  '-jar', jarPath, `--server.port=${port}`,
], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(out);
child.stderr.pipe(out);

const get = (url) => new Promise((resolve) => {
  http.get(url, { timeout: 3000 }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
  }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); resolve(null); });
});

const postJson = (url, payload) => new Promise((resolve) => {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const req = http.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length },
    timeout: 60000,
  }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
  req.on('error', (e) => resolve({ status: 0, body: String(e) }));
  req.write(data); req.end();
});

const postFile = (url, filePath, fields) => new Promise((resolve) => {
  const boundary = '----lbcprobe' + Date.now();
  const fileBuf = fs.readFileSync(filePath);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: image/webp\r\n\r\n`, 'utf8'));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  const body = Buffer.concat(parts);
  const req = http.request(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    timeout: 120000,
  }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
  req.on('error', (e) => resolve({ status: 0, body: String(e) }));
  req.write(body); req.end();
});

let ready = false;
for (let i = 0; i < 90; i++) {
  if (child.exitCode !== null) break;
  if (await get(`http://127.0.0.1:${port}/api/health`)) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 500));
}

const report = { tag, ready };
if (ready) {
  // 1) 建角色
  const created = await postJson(`http://127.0.0.1:${port}/api/characters`, {
    characterID: 'char_conv', characterName: 'CONV', faction: '无阵营', portraits: [],
  });
  report.createCharacter = created.status;

  // 2) 上传真实 WebP 立绘（走 /portraits/upload，与前端同一条接口）
  const up = await postFile(`http://127.0.0.1:${port}/api/characters/char_conv/portraits/upload`,
    webpSrc, { portraitId: 'portrait_conv_1', emotion: 'normal' });
  report.uploadStatus = up.status;
  report.uploadBody = up.body.slice(0, 300);

  // 3) 让应用自己把刚上传的立绘读一遍（GET /api/characters 会触发 Portrait 懒加载）
  const list = await get(`http://127.0.0.1:${port}/api/characters`);
  report.listStatus = list ? list.status : 0;
  await new Promise((r) => setTimeout(r, 1500));
}

child.kill();
await new Promise((r) => setTimeout(r, 1200));
out.end();
await new Promise((r) => setTimeout(r, 300));

// 3) 检查磁盘
const charRoot = path.join(dataRoot, 'assets', 'characters');
const walk = (dir) => {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...walk(full));
    else found.push({ rel: path.relative(dataRoot, full).replace(/\\/g, '/'), size: fs.statSync(full).size });
  }
  return found;
};
report.files = walk(charRoot);

// 4) 魔数校验：主文件必须是 PNG
const pngFile = report.files.find((f) => f.rel.endsWith('.png'));
if (pngFile) {
  const fd = fs.openSync(path.join(dataRoot, pngFile.rel), 'r');
  const head = Buffer.alloc(8);
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  report.pngMagic = head.toString('hex');
  report.isPng = head.toString('hex') === '89504e470d0a1a0a';
}

const text = fs.readFileSync(logPath, 'utf8');
report.convertedLog = text.split(/\r?\n/).filter((l) => /转为 PNG|原图已备份|立绘文件已保存/.test(l)).map((l) => l.trim());
report.decodeLog = text.split(/\r?\n/).filter((l) => /已用 FFmpeg 解码|构建 Portrait|无法加载图像|加载图像失败|WebpImageDecoder/.test(l)).map((l) => l.trim());
report.errors = text.split(/\r?\n/).filter((l) => /ERROR/.test(l)).slice(0, 3).map((l) => l.trim());

console.log(JSON.stringify(report, null, 2));
