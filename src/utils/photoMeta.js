/**
 * 读取本地图片的元信息，用于直传七牛后提交给后端。
 *
 * 原先这些信息由服务端的 sharp 在处理图片时得出；
 * 改为浏览器直传后，图片不再经过服务器，宽高与拍摄时间必须在客户端读取。
 *
 * @param {File} file
 * @returns {Promise<{width: number|null, height: number|null, taken_at: string|null}>}
 *   width/height 来自图片实际解码尺寸（现代浏览器已按 EXIF 方向修正；
 *   读取失败时为 null，前端瀑布流会回退到默认比例）
 *   taken_at 为 "YYYY-MM-DDTHH:mm:ss"，即拍摄当地时间；无 EXIF 时为 null
 */
export async function getFileMeta(file) {
  const meta = { width: null, height: null, taken_at: null }

  // ---- 尺寸：用 Image 解码，浏览器会按 EXIF 方向给出正确的宽高 ----
  try {
    const objectUrl = URL.createObjectURL(file)
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('图片解码失败'))
        el.src = objectUrl
      })
      meta.width = img.naturalWidth || null
      meta.height = img.naturalHeight || null
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    // 解码失败不阻断上传：后端接受缺失的宽高
  }

  // ---- 拍摄时间：与后端 parseTakenAt 使用同一套校验规则 ----
  try {
    // 动态导入：exifr 只在上传时用得到，没必要打进公开访客加载的主包
    const { parse: parseExif } = await import('exifr')
    // 注意 reviveValues:false —— EXIF 时间字符串不带时区，
    // 交给 exifr 解析会被当成 UTC，东八区照片会整整早 8 小时。
    const tags = await parseExif(file, {
      pick: ['DateTimeOriginal', 'CreateDate'],
      reviveValues: false,
      translateValues: false,
    })
    const raw = tags?.DateTimeOriginal || tags?.CreateDate
    const matched = String(raw || '').trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (matched) {
      const [, y, mo, d, h, mi, s] = matched
      const valid = Number(y) >= 1900
        && Number(mo) >= 1 && Number(mo) <= 12
        && Number(d) >= 1 && Number(d) <= 31
        && Number(h) <= 23 && Number(mi) <= 59 && Number(s) <= 60
      if (valid) meta.taken_at = `${y}-${mo}-${d}T${h}:${mi}:${s}`
    }
  } catch {
    // 无 EXIF（如 PNG、截图）属正常情况
  }

  return meta
}
