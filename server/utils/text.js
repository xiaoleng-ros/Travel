/**
 * 修复 multer 将 UTF-8 文件名误读为 Latin-1 导致的乱码：
 * 将字符串按 Latin-1 编码还原为字节，再以 UTF-8 解码；仅当结果含中文时才采用，避免误伤正常文本。
 * @param {string} str - 原始字符串
 * @returns {string} 修复后的字符串
 */
function fixEncoding(str) {
  if (typeof str !== 'string') return str
  try {
    const buf = Buffer.from(str, 'latin1')
    const decoded = buf.toString('utf-8')
    if (/[\u4e00-\u9fff]/.test(decoded)) {
      return decoded
    }
  } catch {}
  return str
}

module.exports = { fixEncoding }
