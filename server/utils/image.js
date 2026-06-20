const fs = require('fs')
const path = require('path')

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
 * 处理上传的图片：校验格式、剥离 EXIF、限制尺寸、转存为安全文件
 * @param {string} srcPath - 上传后的临时文件路径
 * @param {string} destDir - 目标保存目录
 * @returns {Promise<{filename: string, width: number, height: number}|null>}
 */
async function processUploadedImage(srcPath, destDir) {
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

  const outputName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ALLOWED_FORMATS[format].ext}`
  const destPath = path.join(destDir, outputName)

  // 使用 sharp 处理：限制像素、剥离元数据、压缩
  const { width, height } = await sharp(srcPath, {
    limitInputPixels: 268402689, // 16384 * 16384
  })
    .rotate() // 根据 EXIF Orientation 自动旋转
    .withMetadata({ exif: {}, iptc: {}, xmp: {}, icc: {} }) // 清空元数据
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(format, { quality: format === 'png' ? undefined : 85 })
    .toFile(destPath)

  return {
    filename: outputName,
    url: `/uploads/${outputName}`,
    width: width || 4,
    height: height || 3,
  }
}

/**
 * 处理上传的图片并输出为 Buffer
 * @param {string} srcPath - 上传后的临时文件路径
 * @returns {Promise<{buffer: Buffer, format: string, ext: string, width: number, height: number}|null>}
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

  // 使用 sharp 处理：限制像素、剥离元数据、压缩，输出 Buffer
  const { data, info } = await sharp(srcPath, {
    limitInputPixels: 268402689, // 16384 * 16384
  })
    .rotate()
    .withMetadata({ exif: {}, iptc: {}, xmp: {}, icc: {} })
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(format, { quality: format === 'png' ? undefined : 85 })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    format,
    ext: ALLOWED_FORMATS[format].ext,
    width: info.width || 4,
    height: info.height || 3,
  }
}

module.exports = { detectImageFormat, processUploadedImage, processUploadedImageToBuffer, ALLOWED_FORMATS }
