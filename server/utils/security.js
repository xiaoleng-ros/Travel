const path = require('path')
const fs = require('fs')

// 允许的图片文件名扩展名字符集（用于 multer 阶段过滤）
const SAFE_FILENAME_REGEX = /^[\u4e00-\u9fa5a-zA-Z0-9_\- .()\[\]]+$/

/**
 * 安全过滤文本内容：去除 HTML 标签、控制字符，限制长度
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 过滤后的文本
 */
function sanitizeText(text, maxLength = 200) {
  if (typeof text !== 'string') return ''
  // 去除 HTML 标签与潜在脚本
  const noTags = text.replace(/<[^>]*>/g, '')
  // 去除控制字符（保留换行、制表符）
  const noControl = noTags.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  return noControl.slice(0, maxLength).trim()
}

/**
 * 校验文件名是否安全（不含路径分隔符等危险字符）
 * @param {string} filename - 原始文件名
 * @returns {boolean} 是否安全
 */
function isSafeFilename(filename) {
  if (typeof filename !== 'string') return false
  if (filename.length > 255) return false
  return SAFE_FILENAME_REGEX.test(filename)
}

/**
 * 解析上传目录内的安全文件路径
 * @param {string} baseDir - 基础目录（绝对路径）
 * @param {string} filename - 用户传入的文件名
 * @returns {string|null} 安全后的绝对路径，若路径不在 baseDir 内则返回 null
 */
function resolveSafePath(baseDir, filename) {
  // 拒绝包含路径分隔符、空字节或明显的遍历片段的文件名
  if (!filename || typeof filename !== 'string') return null
  if (filename.includes('\0')) return null
  if (filename.includes('/') || filename.includes('\\')) return null
  if (filename.includes('..')) return null

  const safeName = path.basename(filename)
  const resolved = path.resolve(baseDir, safeName)
  const normalizedBase = path.resolve(baseDir)

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null
  }

  return resolved
}

/**
 * 删除基础目录内的安全文件
 * @param {string} baseDir - 基础目录
 * @param {string} filename - 文件名
 * @returns {boolean} 是否删除成功
 */
function deleteSafeFile(baseDir, filename) {
  const filePath = resolveSafePath(baseDir, filename)
  if (!filePath || !fs.existsSync(filePath)) return false

  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

module.exports = { resolveSafePath, deleteSafeFile, sanitizeText, isSafeFilename }
