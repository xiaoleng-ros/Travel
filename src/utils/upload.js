// 与服务端 multer 限制保持一致的单文件上限与格式白名单
const MAX_SIZE = 20 * 1024 * 1024
// 服务端一次最多签发 20 个凭证（upload-tokens 的 filenames 上限），客户端提前拦截
const MAX_BATCH = 20
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i

export function validateUploadFiles(files) {
  if (files.length > MAX_BATCH) {
    return `一次最多上传 ${MAX_BATCH} 张（当前选了 ${files.length} 张），请分批上传`
  }
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
