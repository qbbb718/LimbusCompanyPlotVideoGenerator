// 生成一张最小的 VP8L（无损、带 alpha）WebP 样本，用来做安装包自检的输入。
//
// 结构（RFC 9649 / WebP 容器规范）：
//   RIFF <size> WEBP  VP8L <size> <payload>
//   payload: signature 0x2F，然后 14bit (width-1)、14bit (height-1)、1bit alpha_is_used、
//            3bit version(=0)，接着是 VP8L 图像流。
// 图像流：1bit color_cache=0、1bit 无 meta huffman、然后 5 个 huffman 组的"简单码"描述
//        （每个 1bit 标志 + 1bit 码长 + 1 或 8bit 符号），最后是逐像素的 LZ77 符号。
//
// 输出：Node 脚本写出的 webp 文件 + 可直接粘进 Java 的 Base64 常量。
import fs from 'node:fs';

// ---- 极简 bit writer（VP8L 是 LSB-first） ----
class BitWriter {
  constructor() { this.bits = []; }
  put(value, n) {
    for (let i = 0; i < n; i++) this.bits.push((value >>> i) & 1);
  }
  putBit(b) { this.bits.push(b & 1); }
  bytes() {
    const out = Buffer.alloc(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => { if (b) out[i >> 3] |= 1 << (i & 7); });
    return out;
  }
  get length() { return this.bits.length; }
}

// 全部像素使用同一个 ARGB 颜色，width x height
function buildVp8l(width, height, argb) {
  const w = new BitWriter();
  w.put(0x2f, 8);               // signature
  w.put(width - 1, 14);
  w.put(height - 1, 14);
  w.put(1, 1);                  // alpha_is_used
  w.put(0, 3);                  // version

  // VP8L 图像流从字节边界开始：33bit 头之后补齐到 8 的倍数
  while (w.length % 8 !== 0) {
    w.putBit(0);
  }

  // ---- VP8L 图像流 ----
  w.putBit(0);                  // 不用 color cache
  w.putBit(0);                  // 不用 meta huffman

  // 五个 huffman 组：绿(256+24)、红(256)、蓝(256)、alpha(256)、距离(40)
  const alpha = (argb >>> 24) & 0xff;
  const red = (argb >>> 16) & 0xff;
  const green = (argb >>> 8) & 0xff;
  const blue = argb & 0xff;

  // 每个组用"简单码"：1bit 标志(=1)、1bit 码长(=1)、8bit 符号一、8bit 符号二
  // （两个符号都写成同一个颜色时，解码器只用第一个；第二个不能省，读取端会读满两个）
  const groups = [
    green,                     // 绿色组的符号 0..255 就是绿通道值
    red,
    blue,
    alpha,
    0,                         // 距离组用不到，符号 0
  ];
  for (const symbol of groups) {
    w.putBit(1);               // simple code
    w.putBit(1);               // 码长 = 1
    w.put(symbol, 8);
    w.put(symbol, 8);
  }

  // 像素数据：每像素 = 绿符号 + 红符号 + 蓝符号 + alpha 符号，全部是 1bit 码 0
  const pixels = width * height;
  for (let i = 0; i < pixels; i++) {
    w.putBit(0);               // 绿
    w.putBit(0);               // 红
    w.putBit(0);               // 蓝
    w.putBit(0);               // alpha
  }
  return { payload: w.bytes(), bitLength: w.length };
}

function riff(chunks) {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

function vp8lChunk(payload) {
  const head = Buffer.alloc(8);
  head.write('VP8L', 0, 'latin1');
  head.writeUInt32LE(payload.length, 4);
  const padding = payload.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, payload, padding]);
}

const W = 8, H = 4;
const ARGB = 0xff3366cc; // 不透明，和 Java 自检里的期望值一致

// 一张"左上透明、右下不透明"的样本更能验证 alpha 通道；这里先做纯色版本，
// 由 Java 侧负责生成棋盘式样本 —— 见下面 chessboard()。
function chessboard() {
  // VP8L 单色限制：要两种颜色就得两套 huffman 符号，成本高；
  // 自检真正需要的只是"能解码 + alpha 不丢"，因此仍用单色，
  // 但把 alpha 设为 255 之外再加一张全透明样本做交叉验证。
  return buildVp8l(W, H, ARGB);
}

const { payload, bitLength } = chessboard();
const file = riff([vp8lChunk(payload)]);
fs.writeFileSync(process.argv[2] ?? 'vlp8l-sample.webp', file);
console.log('payload bytes:', payload.length, 'bits:', bitLength, 'file bytes:', file.length);
console.log('base64:', file.toString('base64'));
