const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const { Mutex } = require('async-mutex')
const { encrypt, decrypt } = require('./utils/crypto')

const DB_PATH = path.join(__dirname, 'data', 'db.json')

// 生成随机初始密码，避免硬编码默认密码
function generateInitialPassword() {
  return require('crypto').randomBytes(12).toString('base64url')
}

// 从环境变量读取初始密码，未设置则随机生成并在控制台打印
const rawInitialPassword = process.env.ADMIN_INITIAL_PASSWORD || generateInitialPassword()

const defaultDb = {
  users: [
    {
      id: 1,
      username: 'admin',
      password: bcrypt.hashSync(rawInitialPassword, 10),
      nickname: '管理员',
    },
  ],
  albums: [],
  photos: [],
  tokenBlacklist: [],
  settings: {
    storage: {
      activeProvider: 'local',
      providers: {},
    },
  },
}

let db = null
const saveMutex = new Mutex()

// 危险键过滤，防止原型污染
function sanitizeKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    result[key] = obj[key]
  }
  return result
}

function getNextId(type) {
  if (!db._nextIds) db._nextIds = {}
  if (!db._nextIds[type]) {
    const existing = type === 'album'
      ? db.albums.map(a => a.id)
      : type === 'photo'
        ? db.photos.map(p => p.id)
        : type === 'user'
          ? db.users.map(u => u.id)
          : []
    db._nextIds[type] = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }
  const id = db._nextIds[type]
  db._nextIds[type] += 1
  return id
}

function load() {
  let createdDefault = false
  try {
    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    }
  } catch {}
  if (!db || !db.users || !db.albums || !db.photos) {
    db = JSON.parse(JSON.stringify(defaultDb))
    createdDefault = true
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
  }
  // 兼容旧数据库：补全 settings.storage 结构
  if (!db.settings || !db.settings.storage) {
    db.settings = { ...db.settings, storage: defaultDb.settings.storage }
  }
  // 仅当首次生成默认管理员时打印初始密码，便于用户登录后修改
  if (createdDefault) {
    console.log('='.repeat(60))
    console.log('已创建默认管理员账号：admin')
    console.log('初始密码：' + rawInitialPassword)
    console.log('请尽快登录并修改密码，或设置 ADMIN_INITIAL_PASSWORD 环境变量')
    console.log('='.repeat(60))
  }
  return db
}

async function save() {
  await saveMutex.runExclusive(() => {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // _nextIds 为运行时内部状态，不持久化
    const dataToSave = { ...db }
    delete dataToSave._nextIds

    fs.writeFileSync(DB_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8')
  })
}

load()

function getUsers() { return db.users }
function getAlbums() { return db.albums }
function getPhotos() { return db.photos }

function findAlbum(id) { return db.albums.find(a => a.id === id) }
function findPhoto(id) { return db.photos.find(p => p.id === id) }

async function addAlbum(album) {
  album.id = getNextId('album')
  db.albums.push(album)
  await save()
  return album
}

async function updateAlbum(id, data) {
  const idx = db.albums.findIndex(a => a.id === id)
  if (idx === -1) return null
  db.albums[idx] = { ...db.albums[idx], ...sanitizeKeys(data) }
  await save()
  return db.albums[idx]
}

async function deleteAlbum(id) {
  const album = findAlbum(id)
  if (!album) return null

  db.albums = db.albums.filter(a => a.id !== id)
  // also delete photos in this album
  const deletedPhotos = db.photos.filter(p => p.album_id === id)
  db.photos = db.photos.filter(p => p.album_id !== id)
  await save()
  return deletedPhotos
}

async function addPhoto(photo) {
  photo.id = getNextId('photo')
  db.photos.push(photo)
  await save()
  return photo
}

async function addPhotos(photos) {
  const added = []
  for (const p of photos) {
    p.id = getNextId('photo')
    db.photos.push(p)
    added.push(p)
  }
  await save()
  return added
}

async function deletePhoto(id) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1) return null
  const [photo] = db.photos.splice(idx, 1)
  await save()
  return photo
}

function getPhotosByAlbum(albumId) {
  return db.photos.filter(p => p.album_id === albumId)
}

function getAllPhotos() {
  return db.photos
}

function isTokenBlacklisted(token) {
  if (!db.tokenBlacklist) return false
  try {
    const decoded = require('jsonwebtoken').decode(token)
    const jti = decoded?.jti
    if (jti) return db.tokenBlacklist.includes(jti)
  } catch {}
  return false
}

async function blacklistToken(token) {
  if (!db.tokenBlacklist) db.tokenBlacklist = []
  try {
    const decoded = require('jsonwebtoken').decode(token)
    const jti = decoded?.jti
    if (jti && !db.tokenBlacklist.includes(jti)) {
      db.tokenBlacklist.push(jti)
      await save()
    }
  } catch {}
}

// 需要加密的存储凭证字段
const STORAGE_SECRET_FIELDS = {
  oss: ['accessKeyId', 'accessKeySecret'],
  cos: ['secretId', 'secretKey'],
  kodo: ['accessKey', 'secretKey'],
}

/**
 * 加密指定提供者的敏感字段
 * @param {string} provider - 提供者标识
 * @param {object} config - 原始配置
 * @returns {object} 敏感字段加密后的配置
 */
function encryptStorageConfig(provider, config) {
  if (!config) return config
  const secretFields = STORAGE_SECRET_FIELDS[provider] || []
  const result = { ...config }
  for (const field of secretFields) {
    if (result[field] && typeof result[field] === 'string' && !result[field].includes(':')) {
      result[field] = encrypt(result[field])
    }
  }
  return result
}

/**
 * 解密指定提供者的敏感字段
 * @param {string} provider - 提供者标识
 * @param {object} config - 加密后的配置
 * @returns {object} 解密后的配置
 */
function decryptStorageConfig(provider, config) {
  if (!config) return config
  const secretFields = STORAGE_SECRET_FIELDS[provider] || []
  const result = { ...config }
  for (const field of secretFields) {
    if (result[field] && typeof result[field] === 'string' && result[field].includes(':')) {
      result[field] = decrypt(result[field])
    }
  }
  return result
}

function getStorageSettings() {
  return db.settings?.storage || defaultDb.settings.storage
}

/**
 * 更新存储配置，敏感字段自动加密
 * @param {object} settings - 包含 activeProvider 和 providers 的设置
 */
async function updateStorageSettings(settings) {
  if (!db.settings) db.settings = {}
  const providers = {}
  for (const [provider, config] of Object.entries(settings.providers || {})) {
    providers[provider] = encryptStorageConfig(provider, config)
  }
  db.settings.storage = {
    activeProvider: settings.activeProvider || 'local',
    providers,
  }
  await save()
  return db.settings.storage
}

/**
 * 获取当前激活的存储配置（已解密）
 * @returns {{ provider: string, config: object }}
 */
function getActiveStorageConfig() {
  const settings = getStorageSettings()
  const provider = settings.activeProvider || 'local'
  const rawConfig = settings.providers?.[provider]
  if (provider === 'local' || !rawConfig) {
    return { provider: 'local', config: {} }
  }
  return { provider, config: decryptStorageConfig(provider, rawConfig) }
}

module.exports = {
  getUsers,
  getAlbums,
  getPhotos,
  findAlbum,
  findPhoto,
  addAlbum,
  updateAlbum,
  deleteAlbum,
  addPhoto,
  addPhotos,
  deletePhoto,
  getPhotosByAlbum,
  getAllPhotos,
  save,
  sanitizeKeys,
  isTokenBlacklisted,
  blacklistToken,
  getStorageSettings,
  updateStorageSettings,
  getActiveStorageConfig,
  encryptStorageConfig,
  decryptStorageConfig,
}
