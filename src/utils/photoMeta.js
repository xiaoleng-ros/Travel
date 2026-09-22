/**
 * 读取本地图片的 EXIF 拍摄时间，用于直传七牛后提交给后端。
 *
 * 原先这些信息由服务端的 sharp 在处理图片时得出；改为浏览器直传后，
 * 图片不再经过服务器，必须在客户端读取。
 *
 * 注意：宽高不在这里读 —— 上传前会先经 `utils/compress.js` 压缩，
 * 压缩结果自带最终尺寸，避免重复解码。
 *
 * ⚠️ 必须传**原始 File**：canvas 重编码会丢掉 EXIF，压缩后的 blob 里没有拍摄时间。
 *
 * @param {File} file 原始文件
 * @returns {Promise<string|null>} "YYYY-MM-DDTHH:mm:ss"（拍摄当地时间）；无 EXIF 时为 null
 */
export async function getExifTime(file) {
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
    if (!matched) return null

    const [, y, mo, d, h, mi, s] = matched
    // 与后端 parseTakenAt 用同一套校验：形状对但数值非法（如 9999-13-45）也要拦掉
    const valid = Number(y) >= 1900
      && Number(mo) >= 1 && Number(mo) <= 12
      && Number(d) >= 1 && Number(d) <= 31
      && Number(h) <= 23 && Number(mi) <= 59 && Number(s) <= 60
    return valid ? `${y}-${mo}-${d}T${h}:${mi}:${s}` : null
  } catch {
    // 无 EXIF（如 PNG、截图）属正常情况
    return null
  }
}
