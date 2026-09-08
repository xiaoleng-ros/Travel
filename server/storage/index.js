/**
 * 存储层统一入口
 * 根据后台配置决定使用本地存储还是云端对象存储
 */
const fs = require('fs')
const path = require('path')
const db = require('../db')
const { createAdapter } = require('./providers')

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads')

/**
 * 生成云端对象 key
 * @param {string} filename - 原始文件名
 * @returns {string}
 */
function generateObjectKey(filename) {
  return `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(filename)}`
}

/**
 * 保存文件：根据配置选择本地或云端
 * @param {Buffer} buffer - 文件内容
 * @param {string} filename - 原始文件名，用于生成 key
 * @returns {{ provider: string, url: string, key?: string }}
 */
async function saveFile(buffer, filename) {
  const { provider, config } = db.getActiveStorageConfig()

  if (provider === 'local' || !config || Object.keys(config).length === 0) {
    // 本地存储：沿用原有 uploads 目录逻辑
    const outputName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(filename)}`
    const destPath = path.join(UPLOAD_DIR, outputName)
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    }
    fs.writeFileSync(destPath, buffer)
    return { provider: 'local', url: `/uploads/${outputName}` }
  }

  // 云端存储
  const adapter = createAdapter(provider, config)
  const key = generateObjectKey(filename)
  const url = await adapter.upload(buffer, key)
  return { provider, url, key }
}

/**
 * 删除指定提供者下的云端对象
 * @param {string} provider - 存储提供者标识
 * @param {string} key - 对象 key
 */
async function deleteFile(provider, key) {
  if (!provider || provider === 'local' || !key) return
  const settings = db.getStorageSettings()
  const rawConfig = settings.providers?.[provider]
  if (!rawConfig) return
  const config = db.decryptStorageConfig(provider, rawConfig)
  const adapter = createAdapter(provider, config)
  await adapter.delete(key)
}

module.exports = { saveFile, deleteFile, generateObjectKey, UPLOAD_DIR }
