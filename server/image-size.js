// ---------------------------------------------------------------------------
// 纯 JS 读取图片宽高 / 格式，不依赖 sharp 等原生模块。
//
// 为什么需要它：七牛自定义域名的 CDN 开启了「过滤参数」，缓存键不包含 query，
// 导致 ?imageInfo 这类接口返回的结果会被同一个 key 的其他请求污染，
// 不能作为获取宽高的可靠来源。改用 Range 拉取文件头部自己解析。
// ---------------------------------------------------------------------------

const SIGNATURES = [
  { name: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { name: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { name: 'gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { name: 'webp', test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { name: 'bmp', test: (b) => b[0] === 0x42 && b[1] === 0x4d },
]

export function detectFormat(buf) {
  if (!buf || buf.length < 12) return null
  for (const sig of SIGNATURES) {
    if (sig.test(buf)) return sig.name
  }
  return null
}

function parseJpeg(buf) {
  // 逐段扫描 SOF0..SOF15（排除 DHT/DAC/DNL 等非 SOF 标记）
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break
    const length = buf.readUInt16BE(offset + 2)
    if (length < 2) break
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function parsePng(buf) {
  if (buf.length < 24) return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function parseGif(buf) {
  if (buf.length < 10) return null
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
}

function parseWebp(buf) {
  if (buf.length < 30) return null
  const chunk = buf.toString('latin1', 12, 16)
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21)
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    const width = buf.readUIntLE(24, 3) + 1
    const height = buf.readUIntLE(27, 3) + 1
    return { width, height }
  }
  return null
}

function parseBmp(buf) {
  if (buf.length < 26) return null
  return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
}

const PARSERS = { jpeg: parseJpeg, png: parsePng, gif: parseGif, webp: parseWebp, bmp: parseBmp }

/**
 * 从文件头部字节推断宽高。
 * @param {Buffer} buf
 * @returns {{width:number,height:number,format:string}|null}
 */
export function imageSizeFromBuffer(buf) {
  const format = detectFormat(buf)
  if (!format) return null
  try {
    const size = PARSERS[format](buf)
    if (!size || !size.width || !size.height) return null
    return { width: size.width, height: size.height, format }
  } catch {
    return null
  }
}
