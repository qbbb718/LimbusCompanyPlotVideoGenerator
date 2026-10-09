/**
 * 极简 ZIP 打包器（仅用 Node 内置模块，压缩算法为 deflate）。
 *
 * <p>为什么不直接用 archiver / yazl：它们都是 devDependencies 或 devDependencies 的
 * 传递依赖，electron-builder 只把生产依赖打进 app.asar，安装版里 require 会直接失败。
 * 日志上报是"应用已经出问题"时的救命功能，绝不应当再依赖一个可能缺失的三方包。
 *
 * <p>写文件的时机是"立即读入内存 → 压缩 → 追加进结果缓冲区"，因此调用方可以边读边删
 * 临时文件，不存在句柄悬空的问题。
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- CRC-32（ZIP 每个文件头都要）----

let crcTable = null;

/** 惰性构建 CRC-32 查表（多项式 0xEDB88320，与 PKZIP 一致） */
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  return crcTable;
}

/** 计算一段数据的 CRC-32，返回无符号整数 */
function crc32(buf) {
  const table = getCrcTable();
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// ---- 时间戳（ZIP 用 MS-DOS 格式，且是本地时间）----

/** 把 Date 转成 ZIP 需要的 MS-DOS 日期/时间（秒只有 2 秒精度） */
function toDosDateTime(date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const year = d.getFullYear();
  // ZIP 的年份基准是 1980，且只有 7 位（最大 2107）
  const dosYear = Math.min(Math.max(year, 1980), 2107) - 1980;
  const dosDate = (dosYear << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { dosDate, dosTime };
}

/** 时间戳 → 压缩包内文件夹 / 文件名用的 YYYYMMDD-HHmmss */
function formatTimestamp(date) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// ---- 目录扫描 ----

/**
 * 递归列出目录下的所有普通文件。
 *
 * <p>用 lstat 而不是 stat：安装版日志目录里可能有指向已删除文件的快捷方式/符号链接，
 * 顺着链接读到断链会让整个"获取日志"失败，而这里只需要绕过它。
 */
function listFilesRecursive(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (err) {
      continue; // 文件在扫描过程中被删掉：跳过
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      result.push(...listFilesRecursive(full));
    } else if (stat.isFile()) {
      result.push({ path: full, name: entry.name, size: stat.size, mtime: stat.mtime });
    }
  }
  return result;
}

/**
 * 取目录下最新的 N 个文件（按修改时间倒序，同一时间内再按文件名倒序保证结果稳定）。
 * 目录不存在时返回空数组，由调用方决定怎么提示用户。
 */
function collectLatestFiles(dir, limit = 10) {
  if (!fs.existsSync(dir)) return [];
  return listFilesRecursive(dir)
    .sort((a, b) => {
      const diff = b.mtime.getTime() - a.mtime.getTime();
      if (diff !== 0) return diff;
      return b.name.localeCompare(a.name);
    })
    .slice(0, Math.max(0, limit));
}

// ---- ZIP 组装 ----

/** 写入一个"本地文件头"，返回写入后新的偏移量 */
function writeLocalHeader(bufs, offset, entry) {
  const nameBuf = Buffer.from(entry.entryName, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // 本地文件头签名 "PK\x03\x04"
  header.writeUInt16LE(20, 4); // 解压所需版本 2.0（deflate）
  header.writeUInt16LE(0x0800, 6); // 通用位标记：bit11 = 文件名是 UTF-8
  header.writeUInt16LE(entry.method, 8); // 0 = 存储，8 = deflate
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressed.length, 18);
  header.writeUInt32LE(entry.raw.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28); // 扩展字段长度
  bufs.push(header, nameBuf, entry.compressed);

  entry.offset = offset;
  entry.nameLength = nameBuf.length;
  return offset + header.length + nameBuf.length + entry.compressed.length;
}

/** 写入一个"中央目录记录" */
function writeCentralHeader(bufs, entry) {
  const nameBuf = Buffer.from(entry.entryName, "utf8");
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0); // 中央目录签名 "PK\x01\x02"
  header.writeUInt16LE(0x031e, 4); // 生成版本：3 = UNIX，30 = 3.0
  header.writeUInt16LE(20, 6); // 解压所需版本 2.0
  header.writeUInt16LE(0x0800, 8); // 通用位标记：文件名 UTF-8
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressed.length, 20);
  header.writeUInt32LE(entry.raw.length, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt16LE(0, 30); // 扩展字段长度
  header.writeUInt16LE(0, 32); // 注释长度
  header.writeUInt16LE(0, 34); // 起始磁盘号
  header.writeUInt16LE(0, 36); // 内部属性
  // 外部属性高 16 位是 UNIX 权限位；0o100644 << 16 会超过 int32 变负数，
  // 必须用 >>> 0 转回无符号再写入。
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38); // 普通文件 rw-r--r--
  header.writeUInt32LE(entry.offset, 42);
  bufs.push(header, nameBuf);
}

/**
 * 把文件列表打包成一个 ZIP 缓冲区。
 *
 * @param {{path:string,name:string,size?:number}[]} files 待打包文件；`name` 是包内文件名
 * @param {{folder?:string}} [options] `folder` 非空时，包内文件统一放进该文件夹
 * @returns {Promise<{buffer:Buffer, entries:{name:string,size:number}[], skipped:{name:string,reason:string}[], rawSize:number, zipSize:number}>}
 */
async function createZipBuffer(files, options = {}) {
  const folder = options.folder ? String(options.folder).replace(/[\\/]+$/, "") : "";
  const bufs = [];
  const central = [];
  const entries = [];
  const skipped = [];
  let offset = 0;
  let rawSize = 0;

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file.path);
    } catch (err) {
      // 单个文件读失败（被占用/已删除）不应该让整包失败
      skipped.push({ name: file.name, reason: `读取失败: ${err.message}` });
      continue;
    }

    // ZIP 传统格式用 32 位字段记录大小，4GB 以上无法表示；日志文件不可能到这个量级
    if (raw.length >= 0xffffffff) {
      skipped.push({ name: file.name, reason: "文件超过 4GB，ZIP 格式无法容纳" });
      continue;
    }

    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    // 已压缩过的内容 deflate 后可能更大：此时退回"存储"，包反而更小
    const useStore = deflated.length >= raw.length;
    const compressed = useStore ? raw : deflated;

    const { dosDate, dosTime } = toDosDateTime(file.mtime);
    const entryName = folder
      ? `${folder}/${String(file.name).replace(/\\/g, "/")}`
      : String(file.name).replace(/\\/g, "/");

    const entry = {
      entryName,
      raw,
      compressed,
      method: useStore ? 0 : 8,
      crc: crc32(raw),
      dosDate,
      dosTime,
      offset: 0,
      nameLength: 0,
    };
    offset = writeLocalHeader(bufs, offset, entry);
    central.push(entry);
    entries.push({ name: entryName, size: raw.length });
    rawSize += raw.length;
  }

  const centralOffset = offset;
  for (const entry of central) {
    writeCentralHeader(bufs, entry);
    offset += 46 + entry.nameLength;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录 "PK\x05\x06"
  end.writeUInt16LE(0, 4); // 当前磁盘号
  end.writeUInt16LE(0, 6); // 中央目录起始磁盘号
  end.writeUInt16LE(central.length, 8); // 本磁盘上的条目数
  end.writeUInt16LE(central.length, 10); // 总条目数
  end.writeUInt32LE(offset - centralOffset, 12); // 中央目录大小
  end.writeUInt32LE(centralOffset, 16); // 中央目录偏移
  end.writeUInt16LE(0, 20); // 注释长度
  bufs.push(end);

  const buffer = Buffer.concat(bufs);
  return { buffer, entries, skipped, rawSize, zipSize: buffer.length };
}

module.exports = {
  crc32,
  formatTimestamp,
  toDosDateTime,
  listFilesRecursive,
  collectLatestFiles,
  createZipBuffer,
};
