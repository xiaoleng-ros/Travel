const fs = require('fs')

// 允许的图片格式及其扩展名
const ALLOWED_FORMATS = {
  jpeg: { ext: '.jpg', mime: 'image/jpeg' },
  png: { ext: '.png', mime: 'image/png' },
  webp: { ext: '.webp', mime: 'image/webp' },
  gif: { ext: '.gif', mime: 'image/gif' },
  avif: { ext: '.avif', mime: 'image/avif' },
  bmp: { ext: '.bmp', mime: 'image/bmp' },
}

// 通过文件头 magic bytes 校验图片格式
function detectImageFormat(buffer) {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg'
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'png'
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'gif'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  // AVIF 基于 ISOBMFF：offset 4-7 为 'ftyp'，随后 major brand 或 compatible brand 含 'avif'/'avis'
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'avif'
    // 检查 compatible brands 区域是否含 avif
    const end = Math.min(buffer.length, 32)
    for (let i = 12; i + 4 <= end; i += 4) {
      if (buffer.toString('ascii', i, i + 4) === 'avif') return 'avif'
    }
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'bmp'
  return null
}

/**
 * 读取照片的拍摄时间（EXIF DateTimeOriginal）。
 *
 * 注意这里刻意不用 exifr 的默认日期解析：EXIF 的时间字符串本身不带时区，
 * 默认解析会把它当作 UTC，导致东八区拍摄的照片回显时整整早 8 小时。
 * 因此用 reviveValues:false 取原始字符串自行转换，全程不做时区换算，
 * 得到的即「拍摄当地的时间」，也正是回忆录按时间线展示时想要的语义。
 *
 * 入参约定为 Buffer（也兼容文件路径）。之所以推荐传 Buffer：exifr 按路径读取时
 * 会开启文件流，在 Windows 上可能来不及释放句柄，导致上传临时文件删不掉。
 *
 * @param {Buffer|string} source - 图片数据（调用方应优先传 Buffer）
 * @returns {Promise<string|null>} "YYYY-MM-DDTHH:mm:ss"，无有效拍摄信息时返回 null
 */
async function readCaptureTime(source) {
  try {
    const exifr = require('exifr')
    const tags = await exifr.parse(source, {
      pick: ['DateTimeOriginal', 'CreateDate'],
      reviveValues: false,
      translateValues: false,
    })
    const raw = tags?.DateTimeOriginal || tags?.CreateDate
    if (typeof raw !== 'string') return null

    const matched = raw.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (!matched) return null

    const [, year, month, day, hour, minute, second] = matched
    // 相机时间未校准时会写入 0000:00:00 之类的非法值，直接丢弃，避免污染时间线
    if (
      Number(year) < 1900 ||
      Number(month) < 1 || Number(month) > 12 ||
      Number(day) < 1 || Number(day) > 31 ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 60
    ) {
      return null
    }
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`
  } catch {
    return null
  }
}

// 展示用主图的最长边
const MAX_DISPLAY_SIZE = 2048

/**
 * 处理上传的图片并输出为 Buffer
 * @param {string} srcPath - 上传后的临时文件路径
 * @returns {Promise<{buffer: Buffer, originalBuffer: Buffer, format: string, ext: string, width: number, height: number, animated: boolean}|null>}
 */
async function processUploadedImageToBuffer(srcPath) {
  const sharp = require('sharp')

  // 读取文件头并校验真实格式
  const fd = fs.openSync(srcPath, 'r')
  const header = Buffer.alloc(16)
  fs.readSync(fd, header, 0, 16, 0)
  fs.closeSync(fd)
  const format = detectImageFormat(header)
  if (!format || !ALLOWED_FORMATS[format]) {
    return null
  }

  // 一次性读入内存，后续 sharp 与 exifr 都基于这份 Buffer 工作。
  // 不让它们直接读文件路径：在 Windows 上二者都可能短暂持有文件句柄，
  // 导致上传临时文件删不掉（EPERM），只能等下次启动才兜底清理。
  const originalBuffer = fs.readFileSync(srcPath)

  // 拍摄时间必须在重编码前读取 —— sharp 的输出会丢弃 EXIF，
  // 处理完再读就拿不到拍摄时间了。
  const takenAt = await readCaptureTime(originalBuffer)

  // 动图：sharp 重编码 GIF 只会保留首帧，因此直接沿用原文件以保持动画
  if (format === 'gif') {
    try {
      const meta = await sharp(originalBuffer, { limitInputPixels: 64000000 }).metadata()
      if (meta.pages && meta.pages > 1) {
        return {
          buffer: originalBuffer,
          originalBuffer,
          format,
          ext: ALLOWED_FORMATS[format].ext,
          width: meta.width || 4,
          height: meta.height || 3,
          animated: true,
          takenAt,
        }
      }
    } catch (err) {
      console.error('读取 GIF 信息失败，按静态图处理:', err.message)
    }
  }

  // 使用 sharp 处理：限制像素、剥离元数据（sharp 默认不回写 EXIF/ICC）、压缩，输出 Buffer
  // 输入用 Buffer 而非文件路径，避免 sharp 持有文件句柄（见上方说明）
  const { data, info } = await sharp(originalBuffer, {
    limitInputPixels: 64000000, // 8000 * 8000，防止超大图解压炸弹
  })
    .rotate()
    .resize({
      width: MAX_DISPLAY_SIZE,
      height: MAX_DISPLAY_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(format, { quality: format === 'png' ? undefined : 85 })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    originalBuffer,
    format,
    ext: ALLOWED_FORMATS[format].ext,
    width: info.width || 4,
    height: info.height || 3,
    animated: false,
    takenAt,
  }
}

// 缩略图最长边。瀑布流列宽约 300-400px，取 640 可在高分屏下保持清晰；
// 由于统一转成 WebP，文件反而比原先 480px 的同格式缩略图更小。
const THUMB_SIZE = 640

/**
 * 生成缩略图，统一输出 WebP。
 *
 * 背景：此前缩略图沿用原图格式，PNG 照片的缩略图动辄几百 KB，
 * 而它恰恰是瀑布流里请求量最大的资源。转 WebP 后同一张图通常能小六成以上，
 * 走 CDN 时直接体现为流量与加载时间下降。
 *
 * 注意返回 ext：扩展名已不再等同于原图格式，调用方必须用正确的后缀保存，
 * 否则文件内容与扩展名不符，静态服务会给出错误的 Content-Type。
 *
 * @param {Buffer} buffer - 已处理的图片 Buffer
 * @param {string} format - 原始图片格式，用于判断是否为动图
 * @returns {Promise<{buffer: Buffer, ext: string}>}
 */
async function processThumbnail(buffer, format) {
  const sharp = require('sharp')
  const animated = format === 'gif'
  const resizeOptions = { width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true }

  try {
    // 动图尽量保留动画（WebP 支持动画）
    const data = await sharp(buffer, { limitInputPixels: 64000000, animated })
      .resize(resizeOptions)
      .webp({ quality: 78, effort: 4 })
      .toBuffer()
    return { buffer: data, ext: '.webp' }
  } catch (err) {
    // 动图转 WebP 失败时退化为静态首帧，不阻断上传
    if (!animated) throw err
    const data = await sharp(buffer, { limitInputPixels: 64000000 })
      .resize(resizeOptions)
      .webp({ quality: 78 })
      .toBuffer()
    return { buffer: data, ext: '.webp' }
  }
}

module.exports = {
  detectImageFormat,
  readCaptureTime,
  processUploadedImageToBuffer,
  processThumbnail,
  ALLOWED_FORMATS,
}
