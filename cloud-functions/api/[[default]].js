/**
 * 人间快照 · Photo Memoir — EdgeOne Cloud Functions 后端（单文件自包含）
 *
 * 为什么是单个文件：EdgeOne 会把 cloud-functions/ 目录下的每个 .js 视为一条路由，
 * 辅助模块放在同目录会产生额外的意外路由，因此全部逻辑集中于此。
 * 本文件挂在 cloud-functions/api/[[default]].js，接管 /api/* 的全部请求。
 *
 * 架构（详见项目根目录 DEPLOY-EDGEONE.md）：
 * - 元数据：libSQL（本地开发 file: 单文件；生产 Turso，HTTP 访问）
 * - 图片：浏览器持凭证直传七牛 Kodo，不经本函数（绕开 6MB 请求体限制）
 * - 缩略图/展示图：七牛 imageView2 实时处理 + CDN 缓存，URL 由本函数按 key 计算
 * - 认证：JWT + httpOnly Cookie，与原 server/ 实现保持一致
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { body, param, validationResult } from 'express-validator'
import rateLimit from 'express-rate-limit'

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason)
})

// ============================================================
// 环境变量
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET 未设置或长度不足 32 位，请在 EdgeOne 项目环境变量中配置')
}

// 生产（远程 Turso）时强制走纯 JS 的 web 客户端，避免原生模块依赖；
// 本地开发（file:）用完整客户端以获得本地 SQLite 文件支持
const DB_URL = process.env.TURSO_DATABASE_URL || 'file:api-dev.db'
const IS_REMOTE_DB = /^(libsql|https?):\/\//i.test(DB_URL)

// 七牛配置
const QINIU_AK = process.env.QINIU_ACCESS_KEY || ''
const QINIU_SK = process.env.QINIU_SECRET_KEY || ''
const QINIU_BUCKET = process.env.QINIU_BUCKET || ''
const QINIU_REGION = (process.env.QINIU_REGION || 'as0').toLowerCase()
const QINIU_CDN_DOMAIN = process.env.QINIU_CDN_DOMAIN || ''
if (!QINIU_CDN_DOMAIN) {
  throw new Error('QINIU_CDN_DOMAIN 未设置（图片访问域名，如 https://img.iceuu.icu），请在环境变量中配置')
}

// 各存储区域对应的表单上传域名（可用 QINIU_UPLOAD_HOST 覆盖）
const UPLOAD_HOST_MAP = {
  z0: 'https://upload.qiniup.com',
  'cn-east-1': 'https://upload.qiniup.com',
  z1: 'https://upload-z1.qiniup.com',
  'cn-north-1': 'https://upload-z1.qiniup.com',
  z2: 'https://upload-z2.qiniup.com',
  'cn-south-1': 'https://upload-z2.qiniup.com',
  na0: 'https://upload-na0.qiniup.com',
  'us-north-1': 'https://upload-na0.qiniup.com',
  as0: 'https://upload-as0.qiniup.com',
  'ap-southeast-1': 'https://upload-as0.qiniup.com',
  'cn-east-2': 'https://upload-cn-east-2.qiniup.com',
}
const QINIU_UPLOAD_HOST = process.env.QINIU_UPLOAD_HOST || UPLOAD_HOST_MAP[QINIU_REGION] || UPLOAD_HOST_MAP.as0

function qiniuConfigured() {
  return !!(QINIU_AK && QINIU_SK && QINIU_BUCKET)
}

// ============================================================
// 通用工具（自原 server/utils 移植）
// ============================================================

/** 修复 UTF-8 被按 Latin-1 误读的乱码（仅当还原结果含中文时采用） */
function fixEncoding(str) {
  if (typeof str !== 'string') return str
  try {
    const decoded = Buffer.from(str, 'latin1').toString('utf-8')
    if (/[\u4e00-\u9fff]/.test(decoded)) return decoded
  } catch {}
  return str
}

/** 去除 HTML 标签与控制字符并限长 */
function sanitizeText(text, maxLength = 200) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLength)
    .trim()
}

const SAFE_FILENAME_REGEX = /^[\u4e00-\u9fa5a-zA-Z0-9_\- .()[\]]+$/
function isSafeFilename(filename) {
  if (typeof filename !== 'string') return false
  if (filename.length > 255) return false
  return SAFE_FILENAME_REGEX.test(filename)
}

const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i

/**
 * base64url 编码，供七牛签名与 entry 编码使用。
 *
 * ⚠️ 必须**保留 `=` 填充**：七牛要求的是「只把 +/ 换成 -_」的 urlsafe base64，
 * 官方 SDK 的 base64ToUrlSafe 也是这么做的（不删 `=`）。
 * 若照 JWT 的习惯剥掉填充，七牛会一律返回 `401 {"error":"bad token"}`，
 * 表现为上传凭证、删除对象全部失败，且错误信息具有误导性（像是密钥不对）。
 * 2026-09-22 用官方 SDK 交叉验证确认：去掉 `=` → 401，保留 `=` → 正常。
 */
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

/** 解析 EXIF 拍摄时间字符串（"2024:05:03 14:30:00"）为 "2024-05-03T14:30:00"，非法返回 null */
function parseTakenAt(raw) {
  const m = String(raw || '').trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  // 相机时间未校准时会出现 0000:00:00 之类的值，直接丢弃避免污染时间线
  if (Number(y) < 1900 || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31
    || Number(h) > 23 || Number(mi) > 59 || Number(s) > 60) return null
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`
}

function nowIso() {
  return new Date().toISOString()
}

/** 异步路由包装：Express 4 不会自动捕获 async 异常，漏接会变成 unhandledRejection */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

// ============================================================
// 七牛：上传凭证签发 / 对象删除（自实现签名，不引入七牛 SDK）
// ============================================================

/**
 * 生成指定 key 的上传凭证。
 * scope 为 "bucket:key" 时凭证只能用于该 key；insertOnly 禁止覆盖已有对象，
 * fsizeLimit / mimeLimit / detectMime 由七牛服务端强制校验。
 */
function createUploadToken(key, expiresSeconds = 3600) {
  const policy = {
    scope: `${QINIU_BUCKET}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + expiresSeconds,
    insertOnly: 1,
    fsizeLimit: 20 * 1024 * 1024,
    mimeLimit: 'image/jpeg;image/png;image/gif;image/webp;image/bmp;image/avif',
    detectMime: 1,
  }
  const encodedPolicy = b64url(JSON.stringify(policy))
  const encodedSign = b64url(crypto.createHmac('sha1', QINIU_SK).update(encodedPolicy).digest())
  return `${QINIU_AK}:${encodedSign}:${encodedPolicy}`
}

/** 生成新的对象 key：photos/202609/<13位时间戳>-<8位随机>.<ext> */
function generateObjectKey(filename) {
  const ext = path.extname(filename).toLowerCase()
  const d = new Date()
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `photos/${ym}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
}

/** 本函数签发的 key 的严格格式（元数据入库时校验，防止伪造任意 key） */
const OBJECT_KEY_REGEX = /^photos\/\d{6}\/\d{13}-[0-9a-f]{8}\.(jpe?g|png|gif|webp|bmp|avif)$/

/**
 * 删除七牛对象。管理 API 签名：QBox <AK>:<hmac_sha1(SK, path + "\n" + body)>。
 * 612 表示对象不存在，视为幂等成功。
 */
async function deleteQiniuObject(key) {
  const entry = b64url(`${QINIU_BUCKET}:${key}`)
  const pathAndQuery = `/delete/${entry}`
  const sign = b64url(crypto.createHmac('sha1', QINIU_SK).update(pathAndQuery + '\n').digest())
  const res = await fetch(`https://rs.qiniuapi.com${pathAndQuery}`, {
    method: 'POST',
    headers: { Authorization: `QBox ${QINIU_AK}:${sign}` },
  })
  if (res.status !== 200 && res.status !== 612) {
    throw new Error(`七牛删除失败（HTTP ${res.status}）`)
  }
}

// ============================================================
// 图片 URL 计算（替代原先 sharp 生成缩略图的职责）
// ============================================================
// 展示图与缩略图都由七牛 imageView2 实时生成并经 CDN 缓存，
// 数据库只存对象 key —— 想调整尺寸/质量改这里即可，无需迁移数据。
// GIF 特殊处理：imageView2 会丢弃动画，因此展示图直接用原文件。

function imageUrl(key, { size = 2048, quality = 85, webp = false } = {}) {
  if (/\.gif$/i.test(key)) return `${QINIU_CDN_DOMAIN}/${key}`
  const params = `imageView2/2/w/${size}/h/${size}/q/${quality}${webp ? '/format/webp' : ''}`
  return `${QINIU_CDN_DOMAIN}/${key}?${params}`
}

function originalUrl(key) {
  return `${QINIU_CDN_DOMAIN}/${key}`
}

/** 数据库行 → API 照片对象（含计算出的 url/thumb/original_url） */
function toApiPhoto(row, { includeInternal = false } = {}) {
  const photo = {
    id: row.id,
    album_id: row.album_id,
    url: imageUrl(row.storage_key, { size: 2048, quality: 85 }),
    thumb: imageUrl(row.storage_key, { size: 640, quality: 80, webp: true }),
    original_url: originalUrl(row.storage_key),
    width: row.width,
    height: row.height,
    title: fixEncoding(row.title),
    name: fixEncoding(row.name),
    description: row.description,
    taken_at: row.taken_at,
    create_time: row.create_time,
  }
  if (includeInternal) {
    photo.storage_provider = row.storage_provider
    photo.storage_key = row.storage_key
  }
  return photo
}

/** 未鉴权接口允许暴露的照片字段白名单 */
const PUBLIC_PHOTO_FIELDS = [
  'id', 'album_id', 'url', 'thumb', 'original_url',
  'width', 'height', 'title', 'name', 'description',
  'create_time', 'taken_at',
]

// ============================================================
// 数据库层（libSQL）
// ============================================================
// 与原 server/db.js 保持相同的函数语义，SQL 化实现；
// 展示排序规则不变：手动 sort_order 优先（NULL 靠后），否则按拍摄时间倒序。

let db = null

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL DEFAULT '',
    password_changed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    create_time TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    storage_provider TEXT NOT NULL DEFAULT 'kodo',
    width INTEGER,
    height INTEGER,
    title TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    taken_at TEXT,
    sort_order INTEGER,
    deleted_at TEXT,
    create_time TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photos_album ON photos (album_id, deleted_at)`,
  `CREATE TABLE IF NOT EXISTS token_blacklist (
    jti TEXT PRIMARY KEY,
    exp INTEGER NOT NULL
  )`,
]

const PHOTO_ORDER = `CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END ASC, sort_order ASC, COALESCE(taken_at, create_time) DESC`

async function initDb() {
  const mod = await import(IS_REMOTE_DB ? '@libsql/client/web' : '@libsql/client')
  // libSQL 0.14+ 的 createClient 只接受对象形式的配置
  db = mod.createClient({
    url: DB_URL,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  })

  await db.batch(SCHEMA)

  const { rows } = await db.execute('SELECT COUNT(*) AS c FROM users')
  if (Number(rows[0]?.c) === 0) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || '123456'
    try {
      await db.execute({
        sql: 'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
        args: ['admin', bcrypt.hashSync(initialPassword, 10), '管理员'],
      })
      console.log(`[init] 已创建默认管理员 admin（初始密码来自 ADMIN_INITIAL_PASSWORD${process.env.ADMIN_INITIAL_PASSWORD ? '' : '，未设置时为 123456'}，请登录后修改）`)
    } catch {
      // 多实例冷启动并发插入时触发唯一约束，另一实例已创建，忽略
    }
  }
}
const ready = initDb()

async function q(sql, args = []) {
  return db.execute({ sql, args })
}

// ---- users ----
async function findUser(id) {
  const { rows } = await q('SELECT * FROM users WHERE id = ?', [id])
  return rows[0] || null
}
async function findUserByName(username) {
  const { rows } = await q('SELECT * FROM users WHERE username = ?', [username])
  return rows[0] || null
}
async function changeUserPassword(id, passwordHash) {
  await q('UPDATE users SET password = ?, password_changed_at = ? WHERE id = ?', [passwordHash, Math.floor(Date.now() / 1000), id])
}

// ---- token blacklist ----
async function isTokenBlacklisted(jti) {
  const { rows } = await q('SELECT 1 FROM token_blacklist WHERE jti = ?', [jti])
  return rows.length > 0
}
async function blacklistToken(jti, exp) {
  if (!jti) return
  await db.batch([
    { sql: 'INSERT OR REPLACE INTO token_blacklist (jti, exp) VALUES (?, ?)', args: [jti, exp || 0] },
    { sql: 'DELETE FROM token_blacklist WHERE exp < ?', args: [Math.floor(Date.now() / 1000)] },
  ])
}

// ---- albums ----
async function getAlbums() {
  const { rows } = await q('SELECT * FROM albums ORDER BY id ASC')
  return rows
}
async function findAlbum(id) {
  const { rows } = await q('SELECT * FROM albums WHERE id = ?', [id])
  return rows[0] || null
}
async function addAlbum({ name, description, cover = '', create_time = nowIso() }) {
  const result = await q('INSERT INTO albums (name, description, cover, create_time) VALUES (?, ?, ?, ?)', [name, description, cover, create_time])
  return findAlbum(Number(result.lastInsertRowid))
}
async function updateAlbum(id, data) {
  const allowed = {}
  for (const key of ['name', 'description', 'cover']) {
    if (data[key] !== undefined) allowed[key] = data[key]
  }
  const keys = Object.keys(allowed)
  if (!keys.length) return findAlbum(id)
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  await q(`UPDATE albums SET ${sets} WHERE id = ?`, [...keys.map((k) => allowed[k]), id])
  return findAlbum(id)
}
/** 删除相册及其全部照片记录（含回收站），返回被删的照片供调用方清理云端对象 */
async function deleteAlbum(id) {
  const { rows: photos } = await q('SELECT * FROM photos WHERE album_id = ?', [id])
  await db.batch([
    { sql: 'DELETE FROM photos WHERE album_id = ?', args: [id] },
    { sql: 'DELETE FROM albums WHERE id = ?', args: [id] },
  ])
  return photos
}

// ---- photos ----
async function getPhotos() {
  const { rows } = await q(`SELECT * FROM photos WHERE deleted_at IS NULL ORDER BY ${PHOTO_ORDER}`)
  return rows
}
async function getPhotosByAlbum(albumId) {
  const { rows } = await q(`SELECT * FROM photos WHERE album_id = ? AND deleted_at IS NULL ORDER BY ${PHOTO_ORDER}`, [albumId])
  return rows
}
async function findPhoto(id) {
  const { rows } = await q('SELECT * FROM photos WHERE id = ?', [id])
  return rows[0] || null
}
async function getDeletedPhotos() {
  const { rows } = await q('SELECT * FROM photos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
  return rows
}
async function getPhotoCountMap() {
  const { rows } = await q('SELECT album_id, COUNT(*) AS c FROM photos WHERE deleted_at IS NULL GROUP BY album_id')
  const map = new Map()
  for (const r of rows) map.set(r.album_id, Number(r.c))
  return map
}
async function addPhotos(records) {
  const added = []
  // 单条 insert 以取回自增 id；每批 ≤20 条，开销可忽略
  for (const r of records) {
    const result = await q(
      `INSERT INTO photos (album_id, storage_key, storage_provider, width, height, title, name, description, taken_at, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.album_id, r.storage_key, r.storage_provider || 'kodo', r.width ?? null, r.height ?? null,
        r.title ?? '', r.name ?? '', r.description ?? '', r.taken_at ?? null, r.create_time || nowIso()],
    )
    added.push(await findPhoto(Number(result.lastInsertRowid)))
  }
  return added
}
async function updatePhoto(id, data) {
  const allowed = {}
  for (const key of ['title', 'description']) {
    if (data[key] !== undefined) allowed[key] = data[key]
  }
  const keys = Object.keys(allowed)
  if (!keys.length) return findPhoto(id)
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  await q(`UPDATE photos SET ${sets} WHERE id = ?`, [...keys.map((k) => allowed[k]), id])
  return findPhoto(id)
}
async function deletePhoto(id) {
  const result = await q('UPDATE photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [nowIso(), id])
  return result.rowsAffected > 0 ? findPhoto(id) : null
}
async function deletePhotos(ids) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const before = (await q(`SELECT * FROM photos WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids)).rows
  if (!before.length) return []
  await q(`UPDATE photos SET deleted_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`, [nowIso(), ...ids])
  return before
}
async function restorePhoto(id) {
  const result = await q('UPDATE photos SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id])
  return result.rowsAffected > 0
}
async function purgePhoto(id) {
  const photo = await findPhoto(id)
  if (!photo) return null
  await q('DELETE FROM photos WHERE id = ?', [id])
  return photo
}
async function reorderPhotos(albumId, orderedIds) {
  const stmts = [{ sql: 'UPDATE photos SET sort_order = NULL WHERE album_id = ? AND deleted_at IS NULL', args: [albumId] }]
  orderedIds.forEach((id, index) => {
    stmts.push({ sql: 'UPDATE photos SET sort_order = ? WHERE id = ? AND album_id = ?', args: [index, id, albumId] })
  })
  await db.batch(stmts)
  return getPhotosByAlbum(albumId)
}

// ---- 封面维护 ----
/**
 * 被删除的照片若是相册封面则回退到剩余第一张。
 * 比对时用该照片「全部三种计算 URL」——封面上传时存的是缩略图地址，
 * 只比单一地址会永远匹配不上（这是旧实现的真实缺陷，曾导致封面死链）。
 */
async function resetAlbumCoverIfNeeded(albumId, removedPhotos) {
  const album = await findAlbum(albumId)
  if (!album || !album.cover) return
  const removedUrls = new Set()
  for (const p of [].concat(removedPhotos)) {
    removedUrls.add(imageUrl(p.storage_key, { size: 2048, quality: 85 }))
    removedUrls.add(imageUrl(p.storage_key, { size: 640, quality: 80, webp: true }))
    removedUrls.add(originalUrl(p.storage_key))
  }
  if (!removedUrls.has(album.cover)) return
  const rest = await getPhotosByAlbum(albumId)
  await updateAlbum(albumId, { cover: rest.length > 0 ? imageUrl(rest[0].storage_key, { size: 640, quality: 80, webp: true }) : '' })
}

// ============================================================
// 认证中间件（与原 server/middleware/auth.js 语义一致）
// ============================================================
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

const wrapAuth = wrap(async (req, res, next) => {
  let token = null
  if (req.cookies && req.cookies.admin_token) token = req.cookies.admin_token
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) token = req.headers.authorization.split(' ')[1]

  if (!token) return res.status(401).json({ code: 401, message: '未登录' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    // 黑名单（登出/改密码时作废的会话）
    if (await isTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ code: 401, message: '登录已过期' })
    }
    // 密码修改时间晚于签发时间 → 旧会话全部失效（改密码 = 全端下线）
    const user = await findUser(payload.id)
    if (!user) return res.status(401).json({ code: 401, message: '账号不存在，请重新登录' })
    if (user.password_changed_at && payload.iat < user.password_changed_at) {
      return res.status(401).json({ code: 401, message: '密码已变更，请重新登录' })
    }
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' })
  }
})

// ============================================================
// 限流（内存计数，Serverless 多实例下为尽力而为的保护）
// ============================================================
function isUploadPath(req) {
  return req.method === 'POST' && /^\/api\/admin\/(upload-tokens|albums\/\d+\/photos)\/?$/.test(req.path)
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { code: 429, message: '尝试次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isUploadPath,
})
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { code: 429, message: '上传过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})

// ============================================================
// 路由
// ============================================================
function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) return res.status(400).json({ code: 400, message: errors.array()[0].msg })
  next()
}

const albumIdParam = [param('albumId').isInt({ min: 1 }).withMessage('相册ID必须是正整数'), handleValidation]
const photoIdParam = [param('id').isInt({ min: 1 }).withMessage('照片ID必须是正整数'), handleValidation]

function buildApiRouter() {
  const router = express.Router()

  // ---------- 健康检查（供外部监控探活） ----------
  router.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ status: 'ok', time: nowIso() })
  })

  // ---------- 认证 ----------
  router.post('/admin/login', loginLimiter, [
    body('username').trim().notEmpty().withMessage('请输入用户名'),
    body('password').notEmpty().withMessage('请输入密码'),
    handleValidation,
  ], wrap(async (req, res) => {
    const { username, password } = req.body
    const user = await findUserByName(username)
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }
    const token = generateToken(user)
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    res.json({ code: 200, message: '登录成功', data: { user: { id: user.id, username: user.username, nickname: user.nickname } } })
  }))

  router.get('/admin/me', wrapAuth, (req, res) => {
    res.json({ code: 200, data: { id: req.user.id, username: req.user.username } })
  })

  router.post('/admin/change-password', wrapAuth, [
    body('oldPassword').isLength({ min: 1, max: 50 }).withMessage('请输入原密码'),
    body('newPassword').isLength({ min: 8, max: 50 }).withMessage('新密码长度不能少于8个字符')
      .matches(/[A-Z]/).withMessage('新密码必须包含至少一个大写字母')
      .matches(/[a-z]/).withMessage('新密码必须包含至少一个小写字母')
      .matches(/[0-9]/).withMessage('新密码必须包含至少一个数字')
      .matches(/[^a-zA-Z0-9]/).withMessage('新密码必须包含至少一个特殊字符'),
    handleValidation,
  ], wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body
    const user = await findUser(req.user.id)
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在，请重新登录' })
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ code: 400, message: '原密码不正确' })
    }
    if (oldPassword === newPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能与原密码相同' })
    }
    // 写入 password_changed_at：改密码前签发的所有 token（含其他设备）立即失效
    await changeUserPassword(user.id, bcrypt.hashSync(newPassword, 10))
    const currentToken = req.cookies?.admin_token
      || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null)
    if (currentToken) {
      const decoded = jwt.decode(currentToken)
      await blacklistToken(decoded?.jti, decoded?.exp)
    }
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    res.json({ code: 200, message: '密码修改成功，请重新登录' })
  }))

  router.post('/admin/logout', wrap(async (req, res) => {
    const token = req.cookies?.admin_token
    if (token) {
      const decoded = jwt.decode(token)
      await blacklistToken(decoded?.jti, decoded?.exp)
    }
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    res.json({ code: 200, message: '退出成功' })
  }))

  // ---------- 相册管理 ----------
  router.get('/admin/albums', wrapAuth, wrap(async (req, res) => {
    const countMap = await getPhotoCountMap()
    const albums = (await getAlbums()).map((a) => ({ ...a, photo_count: countMap.get(a.id) || 0 }))
    res.json({ code: 200, data: albums })
  }))

  router.get('/admin/albums/:id', wrapAuth, [param('id').isInt({ min: 1 }).withMessage('相册ID必须是正整数'), handleValidation], wrap(async (req, res) => {
    const album = await findAlbum(Number(req.params.id))
    if (!album) return res.status(404).json({ code: 404, message: '相册不存在' })
    res.json({ code: 200, data: album })
  }))

  router.post('/admin/albums', wrapAuth, [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('相册名称长度为1-100个字符')
      .custom((value) => sanitizeText(value, 100) === value).withMessage('相册名称包含非法字符'),
    body('description').optional().custom((value) => typeof value === 'string' && value.length <= 500).withMessage('相册描述不能超过500个字符'),
    handleValidation,
  ], wrap(async (req, res) => {
    const { name, description } = req.body
    const album = await addAlbum({ name: sanitizeText(name, 100), description: sanitizeText(description || '', 500) })
    res.json({ code: 200, message: '创建成功', data: album })
  }))

  router.put('/admin/albums/:id', wrapAuth, [param('id').isInt({ min: 1 }).withMessage('相册ID必须是正整数'), handleValidation], [
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('相册名称长度为1-100个字符')
      .custom((value) => sanitizeText(value, 100) === value).withMessage('相册名称包含非法字符'),
    body('description').optional().custom((value) => typeof value === 'string' && value.length <= 500).withMessage('相册描述不能超过500个字符'),
    body('cover').optional().custom((value) => value === '' || /^https?:\/\/[^\s]+$/.test(value)).withMessage('封面地址格式不正确'),
    handleValidation,
  ], wrap(async (req, res) => {
    const { name, description, cover } = req.body
    const data = {}
    if (name !== undefined) data.name = sanitizeText(name, 100)
    if (description !== undefined) data.description = sanitizeText(description, 500)
    if (cover !== undefined) data.cover = cover
    const updated = await updateAlbum(Number(req.params.id), data)
    if (!updated) return res.status(404).json({ code: 404, message: '相册不存在' })
    res.json({ code: 200, message: '更新成功', data: updated })
  }))

  router.delete('/admin/albums/:id', wrapAuth, [param('id').isInt({ min: 1 }).withMessage('相册ID必须是正整数'), handleValidation], wrap(async (req, res) => {
    const id = Number(req.params.id)
    const album = await findAlbum(id)
    if (!album) return res.status(404).json({ code: 404, message: '相册不存在' })
    const deletedPhotos = await deleteAlbum(id)
    // 逐一删除云端对象（失败仅记日志，不阻断响应——对象可稍后手动清理）
    await Promise.allSettled(deletedPhotos.map((p) => deleteQiniuObject(p.storage_key)))
    res.json({ code: 200, message: '删除成功' })
  }))

  // ---------- 照片管理 ----------

  // 批量签发直传凭证：前端拿到后直接向七牛表单上传，图片不经过本函数
  router.post('/admin/upload-tokens', wrapAuth, uploadLimiter, [
    body('filenames').isArray({ min: 1, max: 20 }).withMessage('一次最多上传 20 张照片'),
    body('filenames.*').custom((value) => typeof value === 'string' && isSafeFilename(value) && ALLOWED_EXT.test(value))
      .withMessage('文件名不合法或格式不支持'),
    handleValidation,
  ], wrap(async (req, res) => {
    if (!qiniuConfigured()) {
      return res.status(500).json({ code: 500, message: '七牛云未配置：请检查 QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_BUCKET 环境变量' })
    }
    const tokens = req.body.filenames.map((name) => {
      const key = generateObjectKey(name)
      return { key, token: createUploadToken(key), uploadUrl: QINIU_UPLOAD_HOST }
    })
    res.json({ code: 200, data: { tokens } })
  }))

  // 相册照片列表
  router.get('/admin/albums/:albumId/photos', wrapAuth, albumIdParam, wrap(async (req, res) => {
    const photos = await getPhotosByAlbum(Number(req.params.albumId))
    res.json({ code: 200, data: photos.map((p) => toApiPhoto(p, { includeInternal: true })) })
  }))

  // 直传完成后的元数据入库（一批 ≤ 20 张）
  router.post('/admin/albums/:albumId/photos', wrapAuth, uploadLimiter, albumIdParam, [
    body('photos').isArray({ min: 1, max: 20 }).withMessage('照片数据格式不正确（一次 1-20 张）'),
    body('photos.*.key').matches(OBJECT_KEY_REGEX).withMessage('对象 key 不合法'),
    body('photos.*.width').optional({ nullable: true }).isInt({ min: 1, max: 8000 }).withMessage('宽度参数不合法'),
    body('photos.*.height').optional({ nullable: true }).isInt({ min: 1, max: 8000 }).withMessage('高度参数不合法'),
    body('photos.*.taken_at').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/).withMessage('拍摄时间格式不正确'),
    body('photos.*.name').optional({ nullable: true }).isLength({ max: 100 }).withMessage('名称不能超过100个字符'),
    handleValidation,
  ], wrap(async (req, res) => {
    const albumId = Number(req.params.albumId)
    const album = await findAlbum(albumId)
    if (!album) return res.status(404).json({ code: 404, message: '相册不存在' })

    const records = req.body.photos.map((p) => {
      const safeName = sanitizeText(fixEncoding(p.name || ''), 100) || '未命名'
      // 形状之外再做数值范围校验（9999-13-45 之类能过正却不是合法时间）
      const takenAt = p.taken_at ? parseTakenAt(p.taken_at.replace(/-/g, ':').replace('T', ' ')) : null
      return {
        album_id: albumId,
        storage_key: p.key,
        storage_provider: 'kodo',
        width: p.width ?? null,
        height: p.height ?? null,
        title: safeName,
        name: safeName,
        description: '',
        taken_at: takenAt || null,
        create_time: nowIso(),
      }
    })

    const added = await addPhotos(records)

    // 相册尚无封面时用第一张的缩略图地址
    if (!album.cover && added.length > 0) {
      await updateAlbum(albumId, { cover: imageUrl(added[0].storage_key, { size: 640, quality: 80, webp: true }) })
    }

    res.json({ code: 200, message: '上传成功', data: added.map((p) => toApiPhoto(p, { includeInternal: true })) })
  }))

  // 修改标题 / 描述
  router.patch('/admin/photos/:id', wrapAuth, photoIdParam, [
    body('title').optional().isLength({ min: 1, max: 100 }).withMessage('标题长度为1-100个字符'),
    body('description').optional().isLength({ max: 500 }).withMessage('描述不能超过500个字符'),
    handleValidation,
  ], wrap(async (req, res) => {
    const data = {}
    if (req.body.title !== undefined) data.title = sanitizeText(fixEncoding(req.body.title), 100)
    if (req.body.description !== undefined) data.description = sanitizeText(fixEncoding(req.body.description), 500)
    if (!Object.keys(data).length) return res.status(400).json({ code: 400, message: '没有需要更新的内容' })
    const updated = await updatePhoto(Number(req.params.id), data)
    if (!updated) return res.status(404).json({ code: 404, message: '照片不存在' })
    res.json({ code: 200, message: '保存成功', data: toApiPhoto(updated, { includeInternal: true }) })
  }))

  // 重排相册内照片顺序
  router.patch('/admin/albums/:albumId/photos/reorder', wrapAuth, albumIdParam, [
    body('ids').isArray({ min: 1 }).withMessage('排序数据格式不正确'),
    body('ids.*').isInt({ min: 1 }).withMessage('排序数据格式不正确'),
    handleValidation,
  ], wrap(async (req, res) => {
    const albumId = Number(req.params.albumId)
    if (!(await findAlbum(albumId))) return res.status(404).json({ code: 404, message: '相册不存在' })
    const photos = await reorderPhotos(albumId, req.body.ids.map(Number))
    res.json({ code: 200, message: '顺序已保存', data: photos.map((p) => toApiPhoto(p, { includeInternal: true })) })
  }))

  // 软删除（回收站）
  router.delete('/admin/photos/:id', wrapAuth, photoIdParam, wrap(async (req, res) => {
    const photo = await deletePhoto(Number(req.params.id))
    if (!photo) return res.status(404).json({ code: 404, message: '照片不存在' })
    await resetAlbumCoverIfNeeded(photo.album_id, photo)
    res.json({ code: 200, message: '已移入回收站' })
  }))

  // 批量软删除
  router.post('/admin/photos/batch-delete', wrapAuth, wrap(async (req, res) => {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择要删除的照片' })
    if (ids.length > 200) return res.status(400).json({ code: 400, message: '单次最多删除 200 张照片' })
    const numIds = ids.map(Number).filter(Number.isInteger)
    const deleted = await deletePhotos(numIds)
    if (!deleted.length) return res.status(400).json({ code: 400, message: '所选照片不存在或已在回收站' })
    for (const albumId of new Set(deleted.map((p) => p.album_id))) {
      await resetAlbumCoverIfNeeded(albumId, deleted.filter((p) => p.album_id === albumId))
    }
    res.json({ code: 200, message: `已将 ${deleted.length} 张照片移入回收站`, data: { count: deleted.length } })
  }))

  // 从回收站恢复
  router.post('/admin/photos/:id/restore', wrapAuth, photoIdParam, wrap(async (req, res) => {
    const id = Number(req.params.id)
    const existing = await findPhoto(id)
    if (!existing || !existing.deleted_at) return res.status(404).json({ code: 404, message: '回收站中没有这张照片' })
    if (!(await findAlbum(existing.album_id))) return res.status(400).json({ code: 400, message: '所属相册已被删除，无法恢复' })
    await restorePhoto(id)
    res.json({ code: 200, message: '已恢复' })
  }))

  // 彻底删除（连同云端对象）
  router.delete('/admin/photos/:id/purge', wrapAuth, photoIdParam, wrap(async (req, res) => {
    const id = Number(req.params.id)
    const existing = await findPhoto(id)
    if (!existing) return res.status(404).json({ code: 404, message: '照片不存在' })
    if (!existing.deleted_at) return res.status(400).json({ code: 400, message: '请先移入回收站，再彻底删除' })
    const photo = await purgePhoto(id)
    // 先回退封面（这是物理对象被删除的环节），再删云端对象
    await resetAlbumCoverIfNeeded(photo.album_id, photo)
    try {
      if (photo.storage_provider === 'kodo') await deleteQiniuObject(photo.storage_key)
    } catch (err) {
      console.error('删除云端对象失败:', photo.storage_key, err.message)
    }
    res.json({ code: 200, message: '已彻底删除' })
  }))

  // 回收站列表
  router.get('/admin/photos/trash', wrapAuth, wrap(async (req, res) => {
    const photos = await getDeletedPhotos()
    res.json({ code: 200, data: photos.map((p) => toApiPhoto(p, { includeInternal: true })) })
  }))

  // 最近照片（概览页）
  router.get('/admin/photos/recent', wrapAuth, wrap(async (req, res) => {
    // 上下都封：SQLite 里负 LIMIT 表示不限制，不能把负数透传下去
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
    const { rows } = await q(`SELECT * FROM photos WHERE deleted_at IS NULL ORDER BY create_time DESC LIMIT ?`, [limit])
    res.json({ code: 200, data: rows.map((p) => toApiPhoto(p)) })
  }))

  // ---------- 公开接口（未鉴权） ----------
  function publicCache(req, res, next) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
    next()
  }

  router.get('/album/public/list', publicCache, wrap(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100)
    const countMap = await getPhotoCountMap()
    const albums = (await getAlbums()).map((a) => ({ ...a, photo_count: countMap.get(a.id) || 0 }))
    const start = (page - 1) * limit
    res.json({ code: 200, message: 'success', data: { result: albums.slice(start, start + limit), total: albums.length, page, limit } })
  }))

  router.get('/album/public/:id/photos', publicCache, wrap(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100)
    const albumId = Number(req.params.id)
    const photos = albumId === 0 ? await getPhotos() : await getPhotosByAlbum(albumId)
    const start = (page - 1) * limit
    const result = photos.slice(start, start + limit).map((p) => {
      const api = toApiPhoto(p)
      const filtered = {}
      for (const field of PUBLIC_PHOTO_FIELDS) {
        if (field === 'create_time') {
          // 前台展示「拍摄日期」，无拍摄信息时回退上传日期（与原实现一致）
          filtered.create_time = new Date(p.taken_at || p.create_time).toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric',
          })
        } else if (api[field] !== undefined) {
          filtered[field] = api[field]
        }
      }
      return filtered
    })
    res.json({ code: 200, message: 'success', data: { result, total: photos.length, page, limit } })
  }))

  return router
}

// ============================================================
// 应用组装
// ============================================================
let cachedIndexHtml

function loadIndexHtml() {
  if (cachedIndexHtml !== undefined) return cachedIndexHtml
  // EdgeOne includeFiles 会把 dist/index.html 复制进构建产物；
  // 相对路径在不同运行方式下基准不同，依次尝试（本地 dev 从项目根也能命中）
  for (const p of ['dist/index.html', './dist/index.html', '../dist/index.html', '../../dist/index.html']) {
    try {
      cachedIndexHtml = fs.readFileSync(p, 'utf8')
      return cachedIndexHtml
    } catch {}
  }
  cachedIndexHtml = null
  return null
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  // EdgeOne 平台自身是反向代理。用「跳数」而不是 true：
  // true 会让 express-rate-limit 判定为可被 X-Forwarded-For 伪造绕过的宽松配置而报错，
  // 数值跳数既能让限流拿到真实客户端 IP，又不给伪造留口子。
  // 若实际链路层数不同，可用 TRUST_PROXY_HOPS 调整。
  const hops = Number(process.env.TRUST_PROXY_HOPS)
  app.set('trust proxy', Number.isInteger(hops) && hops >= 0 ? hops : 1)

  // 等待数据库就绪（建表 + 初始管理员），失败则所有请求返回明确的 500
  app.use(wrap(async (req, res, next) => {
    try {
      await ready
      next()
    } catch (err) {
      console.error('[init] 数据库初始化失败:', err.message)
      res.status(500).json({ code: 500, message: '数据库初始化失败：' + err.message })
    }
  }))

  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())

  app.use(apiLimiter)
  // 平台可能把 /api 前缀原样传入，也可能剥离后再传入，两种都挂一次即可覆盖。
  // 这里刻意不改写 req.url —— 改写会把前端路由（如 /admin/albums）误判成接口路径。
  app.use('/api', buildApiRouter())
  app.use('/', buildApiRouter())

  // 未匹配的路径：/api 内的未知接口返回 JSON 404；其余视为前端路由，回退 index.html
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ code: 404, message: '接口不存在' })
    }
    if (req.method !== 'GET') return res.status(404).json({ code: 404, message: '接口不存在' })
    const html = loadIndexHtml()
    if (!html) return res.status(404).send('Not Found')
    res.set('Cache-Control', 'no-cache')
    res.type('html').send(html)
  })

  // 统一错误处理
  app.use((err, req, res, next) => {
    console.error('服务器异常:', err.message)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  })

  return app
}

export default createApp()
