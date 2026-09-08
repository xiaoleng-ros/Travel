// 与服务端 multer 限制保持一致的单文件上限与格式白名单
const MAX_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i

export function validateUploadFiles(files) {
  for (const f of files) {
    if (f.size > MAX_SIZE) {
      return `文件「${f.name}」超过 20MB 限制`
    }
    if (!ALLOWED_EXT.test(f.name)) {
      return `文件「${f.name}」格式不支持（支持 JPG / PNG / GIF / WebP / BMP / AVIF）`
    }
  }
  return null
}
