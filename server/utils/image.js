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

  // 原始字节，用于单独保存「原图」（不重编码、不压缩）
  const originalBuffer = fs.readFileSync(srcPath)

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
        }
      }
    } catch (err) {
      console.error('读取 GIF 信息失败，按静态图处理:', err.message)
    }
  }

  // 使用 sharp 处理：限制像素、剥离元数据（sharp 默认不回写 EXIF/ICC）、压缩，输出 Buffer
  const { data, info } = await sharp(srcPath, {
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
  }
}

/**
 * 从已处理的图片 Buffer 生成小尺寸缩略图
 * 动图会尽量保留动画，失败时回退为静态首帧
 * @param {Buffer} buffer - 已处理的图片 Buffer
 * @param {string} format - 图片格式（jpeg/png/webp/gif/avif/bmp）
 * @returns {Promise<Buffer>} 缩略图 Buffer
 */
async function processThumbnail(buffer, format) {
  const sharp = require('sharp')
  const animated = format === 'gif'
  try {
    return await sharp(buffer, { limitInputPixels: 64000000, animated })
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .toFormat(format, { quality: format === 'png' ? undefined : 80, animated })
      .toBuffer()
  } catch (err) {
    // 动图缩略失败时退化为静态首帧，不阻断上传
    if (!animated) throw err
    return sharp(buffer, { limitInputPixels: 64000000 })
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .toFormat(format)
      .toBuffer()
  }
}

module.exports = { detectImageFormat, processUploadedImageToBuffer, processThumbnail, ALLOWED_FORMATS }
