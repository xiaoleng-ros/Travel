const crypto = require('crypto')

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
  return crypto.scryptSync(secret, 'photo-memoir-salt', 32)
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
