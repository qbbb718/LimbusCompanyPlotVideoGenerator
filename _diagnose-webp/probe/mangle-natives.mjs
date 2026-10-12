// 把安装包 jar 里的原生库 jar 破坏掉，模拟“JavaCPP 加载不到原生库”的现场。
// 目的：拿到 avutil 初始化失败的**真实根因**（用户日志里被 NoClassDefFoundError 掩盖）。
import fs from 'node:fs';

const src = process.argv[2];
const dst = process.argv[3];
if (!src || !dst) {
  console.error('usage: node mangle-natives.mjs <srcJar> <dstJar>');
  process.exit(2);
}
fs.copyFileSync(src, dst);

// 端记录：本地文件头(4) + 版本(2) + 标志(2) + 压缩方式(2) + 时间(2) + 日期(2) + CRC(4)
// + 压缩后大小(4) + 未压缩大小(4) + 文件名长度(2) + 扩展长度(2) + 名字 + 扩展
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;

const buf = fs.readFileSync(dst);
const targets = [];
for (let i = 0; i + 46 <= buf.length; i++) {
  if (buf.readUInt32LE(i) !== SIG_CENTRAL) continue;
  const nameLen = buf.readUInt16LE(i + 28);
  const extraLen = buf.readUInt16LE(i + 30);
  const commentLen = buf.readUInt16LE(i + 32);
  const name = buf.toString('latin1', i + 46, i + 46 + nameLen);
  // ffmpeg 的版本号形如 6.0-1.5.9（两段），javacpp 是 1.5.9，统一用宽松匹配
  if (name.startsWith('BOOT-INF/lib/') && /^(javacpp|ffmpeg)-[\d.\-]+-windows-x86_64\.jar$/.test(name.slice('BOOT-INF/lib/'.length))) {
    targets.push({
      name,
      size: buf.readUInt32LE(i + 24),
      crc: buf.readUInt32LE(i + 16),
      csize: buf.readUInt32LE(i + 20),
      offset: buf.readUInt32LE(i + 42),
      centralOffset: i,
      centralSize: 46 + nameLen + extraLen + commentLen,
    });
  }
  i += 46 + nameLen + extraLen + commentLen - 1;
}

if (targets.length === 0) {
  console.error('no native jar entries found');
  process.exit(1);
}

for (const t of targets) {
  // 找到本地文件头，故意不去动它 —— 让 JavaCPP 能定位到条目，
  // 但把压缩数据整段覆盖成垃圾，模拟 DLL 解包失败 / 被杀软破坏。
  let local = -1;
  const nameBytes = Buffer.from(t.name, 'latin1');
  for (let i = t.offset; i < Math.min(buf.length - 4, t.offset + 4096); i++) {
    if (buf.readUInt32LE(i) === SIG_LOCAL) {
      const nl = buf.readUInt16LE(i + 26);
      const el = buf.readUInt16LE(i + 28);
      if (buf.compare(nameBytes, 0, nl, i + 30, i + 30 + nl) === 0) {
        local = i;
        const dataStart = i + 30 + nl + el;
        const dataEnd = dataStart + t.csize;
        buf.fill(0x5a, dataStart, Math.min(dataEnd, buf.length));
        console.log(`zeroed ${t.csize} bytes of ${t.name} (local@${i})`);
        break;
      }
    }
  }
  if (local < 0) console.log(`local header not found for ${t.name}`);
}
fs.writeFileSync(dst, buf);
console.log('written', dst, fs.statSync(dst).size);
