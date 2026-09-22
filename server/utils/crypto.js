const crypto = require('crypto')

/**
 * 派生密钥缓存。
 *
 * scrypt 是刻意设计成慢的（本机实测单次约 120ms），且结果只取决于密钥字符串本身。
 * 原先每次加解密都重跑一遍 scryptSync，而云端存储模式下每张照片会触发多次解密
 * （主图 / 原图 / 缩略图各一次 saveFile），批量上传时累计数秒。
 * 更要命的是 scryptSync 是同步的，这几秒里整个 Node 进程无法响应任何请求。
 */
let cachedKey = null
let cachedSecret = null

/**
 * 获取加密密钥
 * 优先使用 STORAGE_ENCRYPTION_KEY，否则回退到 JWT_SECRET
 * 通过 scrypt 拉伸到 32 字节，适配 AES-256
 */
function getKey() {
  const secret = process.env.STORAGE_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('缺少 STORAGE_ENCRYPTION_KEY 或 JWT_SECRET 环境变量')
  }
  // 密钥字符串变了（测试切环境等）才重新派生
  if (cachedKey && cachedSecret === secret) return cachedKey
  cachedKey = crypto.scryptSync(secret, 'photo-memoir-salt', 32)
  cachedSecret = secret
  return cachedKey
}

/**
 * 加密敏感文本
 * @param {string} text - 明文
 * @returns {string} iv:authTag:ciphertext 格式密文
 */
function encrypt(text) {
  if (typeof text !== 'string') text = String(text)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * 解密敏感文本
 * @param {string} encryptedText - iv:authTag:ciphertext 格式密文
 * @returns {string} 明文
 */
function decrypt(encryptedText) {
  if (!encryptedText) return ''
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('密文格式不正确')
  }
  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

module.exports = { encrypt, decrypt }
