const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const { Mutex } = require('async-mutex')
const { encrypt, decrypt } = require('./utils/crypto')

const DB_PATH = path.join(__dirname, 'data', 'db.json')

/**
 * 数据库备份目录。
 * 默认与主库同目录（data/backups），但可通过 BACKUP_DIR 指向另一块磁盘、
 * 挂载的异地目录或云盘同步目录 —— 只把备份放在主库旁边，
 * 磁盘损坏或服务器回收时会连主库一起丢，起不到备份作用。
 */
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(__dirname, 'data', 'backups')

// 归档备份保留份数，超出后自动删除最旧的
const BACKUP_KEEP = Math.max(Number(process.env.BACKUP_KEEP) || 20, 1)

/**
 * 云端备份开关（默认关闭）。
 *
 * 为什么需要：照片本体放在对象存储上，但「哪张照片属于哪个相册、标题是什么、
 * 何时拍摄」这些关联信息全在 db.json 里。db.json 一丢，云端的照片就成了一堆
 * 无法归类的无名文件 —— 元数据才是真正的单点。
 *
 * 为什么默认关闭：db.json 含管理员密码哈希、token 黑名单与加密后的存储凭证。
 * 若 bucket 为「公开读」（图片走 CDN 时通常如此），备份文件会被任何人直接下载。
 * 开启前请确认备份前缀为私有读权限，或改用独立的私有 bucket。
 */
const BACKUP_TO_CLOUD = process.env.BACKUP_TO_CLOUD === 'true'

// 备份对象在 bucket 中的前缀，务必与照片的 uploads/ 区分开
const BACKUP_CLOUD_PREFIX = (process.env.BACKUP_CLOUD_PREFIX || 'backups/').replace(/^\/+/, '')

// 上一次写入「按天归档」的日期，避免同一天重复上传
let lastDailyBackupDate = null

/**
 * 原子写入：先写临时文件并 fsync 落盘，再用 rename 覆盖目标。
 * 直接 writeFileSync 覆盖时，若写入过程中进程崩溃或断电，db.json 会停在半截状态，
 * 导致整个库损坏、照片元数据全部丢失；rename 在同分区内是原子操作，可避免该风险。
 */
function writeFileAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  const fd = fs.openSync(tmpPath, 'w')
  try {
    fs.writeFileSync(fd, data, 'utf-8')
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmpPath, filePath)
}

// 生成随机初始密码，避免硬编码默认密码
// 保证同时包含大小写字母、数字和特殊字符，避免被登录/修改密码的强度校验卡住
function generateInitialPassword() {
  const crypto = require('crypto')
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%^&*()-_=+'
  const all = upper + lower + digits + special
  const pick = (set) => set[crypto.randomInt(set.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(special)]
  const rest = Array.from({ length: 12 }, () => pick(all))
  const chars = [...required, ...rest]
  // Fisher-Yates 洗牌，避免固定前缀
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
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

// 危险键过滤，防止原型污染（递归处理嵌套对象与数组）
function sanitizeKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitizeKeys)
  const result = {}
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    result[key] = sanitizeKeys(obj[key])
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
    db._nextIds[type] = existing.length > 0 ? Math.floor(Math.max(...existing)) + 1 : 1
  }
  const id = db._nextIds[type]
  db._nextIds[type] += 1
  return id
}

function load() {
  let createdDefault = false
  // 主数据库解析失败时，尝试从备份文件恢复，避免静默丢数据
  const parseFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  let loadError = null
  try {
    if (fs.existsSync(DB_PATH)) {
      db = parseFile(DB_PATH)
    }
  } catch (err) {
    loadError = err
  }
  if ((!db || !db.users || !db.albums || !db.photos) && loadError) {
    const backupPath = path.join(path.dirname(DB_PATH), 'db.backup.json')
    try {
      if (fs.existsSync(backupPath)) {
        db = parseFile(backupPath)
        console.warn('[警告] 主数据库文件损坏，已从备份恢复：' + backupPath)
      }
    } catch (backupErr) {
      console.error('备份文件同样损坏，无法恢复:', backupErr.message)
    }
  }
  if (!db || !db.users || !db.albums || !db.photos) {
    db = JSON.parse(JSON.stringify(defaultDb))
    createdDefault = true
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    writeFileAtomic(DB_PATH, JSON.stringify(db, null, 2))
  }
  // 兼容旧数据库：补全 settings.storage 结构
  if (!db.settings || !db.settings.storage) {
    db.settings = { ...db.settings, storage: defaultDb.settings.storage }
  }
  // 兼容旧数据库：统一照片 id 为整数。旧数据曾使用 Date.now()+Math.random() 的小数 id，
  // 导致管理端按 id 操作时 isInt 校验失败。照片 id 仅作主键、无外键引用，按时间重排安全。
  if (db.photos.some(p => !Number.isInteger(p.id))) {
    const byTime = [...db.photos].sort((a, b) => new Date(a.create_time || 0) - new Date(b.create_time || 0))
    byTime.forEach((p, i) => { p.id = i + 1 })
    try {
      const dataToSave = { ...db }
      delete dataToSave._nextIds
      writeFileAtomic(DB_PATH, JSON.stringify(dataToSave, null, 2))
      console.log('[迁移] 已将照片 id 统一为整数')
    } catch (e) {
      console.error('照片 id 迁移写入失败:', e.message)
    }
  }
  // 兼容旧数据库：把无过期时间的旧格式黑名单条目升级为可回收格式
  if (migrateTokenBlacklist()) {
    try {
      const dataToSave = { ...db }
      delete dataToSave._nextIds
      writeFileAtomic(DB_PATH, JSON.stringify(dataToSave, null, 2))
    } catch (e) {
      console.error('token 黑名单迁移写入失败:', e.message)
    }
  }
  // 清理已过期的 token 黑名单条目
  pruneTokenBlacklist()
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

/**
 * 把当前数据库归档一份带时间戳的副本，并按 BACKUP_KEEP 清理最旧的。
 * 文件名使用 ISO 时间戳，字典序即时间序，便于排序与人工挑选。
 */
function archiveBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23)
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `db-${stamp}.json`))

    const archives = fs.readdirSync(BACKUP_DIR)
      .filter((name) => /^db-.*\.json$/.test(name))
      .sort()
    const expired = archives.slice(0, Math.max(archives.length - BACKUP_KEEP, 0))
    for (const name of expired) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, name)) } catch {}
    }
  } catch (err) {
    console.error('归档数据库备份失败:', err.message)
  }
}

/**
 * 把数据库快照上传到当前激活的对象存储（七牛 / OSS / COS）。
 *
 * 上传两类对象：
 * - `<prefix>db-latest.json`：每次写入都覆盖，始终代表最新状态；
 * - `<prefix>db-YYYY-MM-DD.json`：每天首次写入时上传一份，用于回溯历史。
 *
 * 清理交给对象存储自身的生命周期规则 —— 适配器没有 list 能力，
 * 在代码里做轮转反而需要额外权限，不如让云厂商那边配一次性规则。
 *
 * 本函数由调用方以不阻塞的方式触发，失败只记录日志，
 * 绝不允许备份问题影响到正常的数据写入。
 *
 * @param {string} content - 数据库 JSON 文本
 */
async function uploadBackupToCloud(content) {
  const { provider, config } = getActiveStorageConfig()
  // 本地存储模式：没有云端可备份
  if (provider === 'local' || !config || Object.keys(config).length === 0) return

  // 延迟 require：storage/index.js 依赖本模块，写在顶层会形成循环依赖
  const { createAdapter } = require('./storage/providers')
  const adapter = createAdapter(provider, config)
  const buffer = Buffer.from(content, 'utf-8')

  const tasks = [adapter.upload(buffer, `${BACKUP_CLOUD_PREFIX}db-latest.json`)]

  const today = new Date().toISOString().slice(0, 10)
  if (lastDailyBackupDate !== today) {
    lastDailyBackupDate = today
    tasks.push(adapter.upload(buffer, `${BACKUP_CLOUD_PREFIX}db-${today}.json`))
  }

  const results = await Promise.allSettled(tasks)
  const firstFailure = results.find((r) => r.status === 'rejected')
  if (firstFailure) {
    throw new Error(firstFailure.reason?.message || '上传失败')
  }
}

async function save() {
  const content = await saveMutex.runExclusive(() => {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // 写入前保留当前版本：
    // 1) db.backup.json —— 固定名，供启动时快速恢复损坏的主库；
    // 2) BACKUP_DIR 下的时间戳归档 —— 可回溯到任意历史版本，并按份数轮转。
    if (fs.existsSync(DB_PATH)) {
      try {
        fs.copyFileSync(DB_PATH, path.join(dir, 'db.backup.json'))
      } catch (err) {
        console.error('备份数据库失败:', err.message)
      }
      archiveBackup()
    }

    // _nextIds 为运行时内部状态，不持久化
    const dataToSave = { ...db }
    delete dataToSave._nextIds

    const serialized = JSON.stringify(dataToSave, null, 2)
    writeFileAtomic(DB_PATH, serialized)
    return serialized
  })

  // 云端备份不参与 await：本地写入已经成功，云端上传慢或失败都不应拖累请求
  if (BACKUP_TO_CLOUD) {
    uploadBackupToCloud(content).catch((err) => {
      console.error('云端备份失败:', err.message)
    })
  }

  return content
}

load()

function getUsers() { return db.users }
function findUser(id) { return db.users.find(u => u.id === id) }
function getAlbums() { return db.albums }

// 未删除的照片（对外默认视图）
function getPhotos() { return db.photos.filter(p => !p.deleted_at) }
// 全部照片（含已软删除），仅内部与回收站使用
function getAllPhotos() { return db.photos }

function findAlbum(id) { return db.albums.find(a => a.id === id) }
function findPhoto(id) { return db.photos.find(p => p.id === id) }

// 按相册统计照片数量：一次遍历建表，避免每个相册都 filter 一遍全量照片
function getPhotoCountMap() {
  const map = new Map()
  for (const p of db.photos) {
    if (p.deleted_at) continue
    map.set(p.album_id, (map.get(p.album_id) || 0) + 1)
  }
  return map
}

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
  // 删除相册时照片一并彻底移除（含回收站中的），物理文件由调用方清理
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

async function updatePhoto(id, data) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1) return null
  db.photos[idx] = { ...db.photos[idx], ...sanitizeKeys(data) }
  await save()
  return db.photos[idx]
}

// 软删除：仅打标记，保留物理文件以便从回收站恢复
async function deletePhoto(id) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1) return null
  if (db.photos[idx].deleted_at) return null
  db.photos[idx].deleted_at = new Date().toISOString()
  await save()
  return db.photos[idx]
}

// 批量软删除：仅对存在且尚未删除的照片打 deleted_at 标记，一次落盘
async function deletePhotos(ids) {
  const deleted = []
  const now = new Date().toISOString()
  for (const id of ids) {
    const p = db.photos.find(x => x.id === id && !x.deleted_at)
    if (p) {
      p.deleted_at = now
      deleted.push(p)
    }
  }
  if (deleted.length > 0) await save()
  return deleted
}

// 从回收站恢复
async function restorePhoto(id) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1 || !db.photos[idx].deleted_at) return null
  delete db.photos[idx].deleted_at
  await save()
  return db.photos[idx]
}

// 彻底删除：从数据库中移除记录（物理文件由调用方清理）
async function purgePhoto(id) {
  const idx = db.photos.findIndex(p => p.id === id)
  if (idx === -1) return null
  const [photo] = db.photos.splice(idx, 1)
  await save()
  return photo
}

function getDeletedPhotos() {
  return db.photos
    .filter(p => p.deleted_at)
    .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at))
}

/**
 * 取照片的时间戳：优先使用 EXIF 拍摄时间，缺失时回退到上传时间。
 * 回忆录按「什么时候拍的」组织才有意义；历史数据没有 taken_at，行为与改动前一致。
 * 注意 taken_at 形如 "2024-05-03T14:30:00"（不带时区），
 * JS 会按本地时间解析，与拍摄当地时间的语义吻合。
 */
function photoTimestamp(photo) {
  const time = new Date(photo.taken_at || photo.create_time).getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * 统一的展示排序：管理员手动排过序的按 sort_order 升序，
 * 未排序的照片（无 sort_order 字段）退化为按拍摄时间倒序（新的在前）。
 */
function sortPhotosForDisplay(photos) {
  return [...photos].sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return photoTimestamp(b) - photoTimestamp(a)
  })
}

function getPhotosByAlbum(albumId) {
  return sortPhotosForDisplay(db.photos.filter(p => p.album_id === albumId && !p.deleted_at))
}

/**
 * 重排相册内照片顺序：按传入的 id 数组依次写入 sort_order。
 * 传入的 id 必须都属于该相册，其余照片保持原顺序接在后面。
 */
async function reorderPhotos(albumId, orderedIds) {
  const inAlbum = db.photos.filter(p => p.album_id === albumId && !p.deleted_at)
  const idSet = new Set(orderedIds.map(Number))
  const ordered = orderedIds
    .map(id => inAlbum.find(p => p.id === Number(id)))
    .filter(Boolean)
  // 未出现在 orderedIds 中的照片接在末尾，避免被漏掉
  const rest = sortPhotosForDisplay(inAlbum.filter(p => !idSet.has(p.id)))

  let order = 0
  for (const p of [...ordered, ...rest]) {
    p.sort_order = order++
  }
  await save()
  return sortPhotosForDisplay(inAlbum)
}

/**
 * 修改用户密码，并记录本次修改时间。
 * password_changed_at 采用秒级时间戳，与 JWT 的 iat 单位一致，
 * 便于在鉴权中间件中直接比较，让改密码前签发的所有 token 立即失效。
 * @param {number} id - 用户 id
 * @param {string} passwordHash - 已 bcrypt 加密的密码
 * @returns {object|null} 更新后的用户对象
 */
async function changeUserPassword(id, passwordHash) {
  const user = findUser(id)
  if (!user) return null
  user.password = passwordHash
  user.password_changed_at = Math.floor(Date.now() / 1000)
  await save()
  return user
}

function isTokenBlacklisted(token) {
  if (!db.tokenBlacklist || !db.tokenBlacklist.length) return false
  try {
    const decoded = require('jsonwebtoken').decode(token)
    const jti = decoded?.jti
    if (!jti) return false
    // 兼容旧版存 jti 字符串的格式
    return db.tokenBlacklist.some((entry) =>
      (entry && typeof entry === 'object' ? entry.jti : entry) === jti
    )
  } catch {}
  return false
}

/**
 * 兼容旧数据库：tokenBlacklist 早期实现只存纯 jti 字符串，没有过期时间。
 * pruneTokenBlacklist 为了安全只能对这类条目「保守保留」，于是它们永不清理，
 * db.json 会随着每次登录/登出持续膨胀。
 *
 * 这里统一升级成 { jti, exp } 格式，并给 7 天宽限期（与 JWT 有效期一致）：
 * 期间旧 token 仍会被正常拦截，到期后自动回收。
 * @returns {boolean} 是否发生了迁移（需要落盘）
 */
function migrateTokenBlacklist() {
  if (!Array.isArray(db.tokenBlacklist) || db.tokenBlacklist.length === 0) return false
  if (!db.tokenBlacklist.some((entry) => typeof entry === 'string')) return false

  const nowSec = Math.floor(Date.now() / 1000)
  const GRACE_SECONDS = 7 * 24 * 60 * 60
  const seen = new Set()
  const migrated = []

  for (const entry of db.tokenBlacklist) {
    if (typeof entry === 'string') {
      if (seen.has(entry)) continue
      seen.add(entry)
      migrated.push({ jti: entry, exp: nowSec + GRACE_SECONDS })
      continue
    }
    if (entry && typeof entry === 'object') {
      const jti = entry.jti
      if (jti && seen.has(jti)) continue
      if (jti) seen.add(jti)
      migrated.push(entry)
    }
  }

  db.tokenBlacklist = migrated
  console.log(`[迁移] token 黑名单已升级为带过期时间的格式（${migrated.length} 条，7 天后自动回收）`)
  return true
}

// 清理已过期的黑名单条目，避免 db.json 无限增长
function pruneTokenBlacklist() {
  if (!db.tokenBlacklist) return
  const nowSec = Math.floor(Date.now() / 1000)
  db.tokenBlacklist = db.tokenBlacklist.filter((entry) => {
    // 旧版字符串格式无 exp 信息，保守保留
    if (!entry || typeof entry !== 'object' || !entry.exp) return true
    return entry.exp > nowSec
  })
}

async function blacklistToken(token) {
  if (!db.tokenBlacklist) db.tokenBlacklist = []
  try {
    const decoded = require('jsonwebtoken').decode(token)
    const jti = decoded?.jti
    const exp = decoded?.exp
    if (jti && !isTokenBlacklisted(token)) {
      db.tokenBlacklist.push({ jti, exp: exp || null })
      pruneTokenBlacklist()
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
  findUser,
  changeUserPassword,
  getAlbums,
  getPhotos,
  findAlbum,
  findPhoto,
  addAlbum,
  updateAlbum,
  deleteAlbum,
  addPhoto,
  addPhotos,
  updatePhoto,
  deletePhoto,
  deletePhotos,
  restorePhoto,
  purgePhoto,
  getDeletedPhotos,
  getPhotoCountMap,
  getPhotosByAlbum,
  getAllPhotos,
  sortPhotosForDisplay,
  photoTimestamp,
  reorderPhotos,
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
