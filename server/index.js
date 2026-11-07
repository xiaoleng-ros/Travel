import express from 'express'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import exifr from 'exifr'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  resolveAmapKey,
  resolveAmapSecurityCode,
  resolveAmapWebServiceKey,
  reverseGeocode,
  wgs84ToGcj02,
} from './geocode.js'
import {
  addPhoto,
  findAlbum,
  findPhoto,
  getDb,
  getDriver,
  initStore,
  listAlbums,
  listPhotos,
  moveToTrash,
  newPhotoId,
  publicSettings,
  purgePhoto,
  restorePhoto,
  saveDb,
  saveSettings,
  stats,
  updatePhoto,
} from './store.js'
import {
  UPLOAD_DIR,
  contentHash,
  createQiniuUploadTarget,
  generateQiniuThumbnail,
  avatarKeyPrefix,
  isQiniuConfigured,
  makeAvatarKey,
  makeObjectKey,
  probeQiniuImage,
  publicUrlFor,
  removeStoredAvatar,
  removeStoredImage,
  saveLocalAvatar,
  saveLocalImage,
  statQiniuObject,
  storageKind,
} from './storage.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET =
  process.env.JWT_SECRET || 'memora-local-development-secret-please-change-me-2026'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'

// 生产环境强制要求设置 JWT_SECRET，否则直接退出——避免用公开的默认密钥签发 token
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[fatal] NODE_ENV=production 时必须设置 JWT_SECRET 环境变量')
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

// 安全响应头：防点击劫持、MIME 嗅探、信息泄漏
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // CSP 放宽到 script-src 'self' 'unsafe-inline'，因为 Vite 产物里有内联脚本
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://webapi.amap.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self';",
  )
  // HSTS：生产环境强制浏览器只用 HTTPS 访问，防止降级到 HTTP 泄漏凭据
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  next()
})

app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

// 数据层懒初始化：Serverless 冷启动时由第一个请求触发；本地则是启动时触发一次
let readyPromise = null
export function ready() {
  if (!readyPromise) {
    readyPromise = initStore().catch((err) => {
      readyPromise = null // 允许下次请求重试
      throw err
    })
  }
  return readyPromise
}

app.use(async (_req, _res, next) => {
  try {
    await ready()
    next()
  } catch (err) {
    next(err)
  }
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '尝试次数过多，请稍后再试。' },
})

// 表态接口的限速：每张照片每分钟每个 IP 最多 30 次
const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '操作过于频繁，请稍后再试。' },
})

function createSession(user) {
  return jwt.sign(
    { id: user.id, email: user.email, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

function readSession(req) {
  const token = req.cookies?.memora_session
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = getDb().users.find((u) => u.id === payload.id)
    if (!user) return null
    // JWT 的 iat 只有秒精度，直接和毫秒级的 passwordChangedAt 比会把「同一秒内
    // 刚签发的新 token」也判成旧的（表现为改完密码立刻被登出）。这里把它截到秒。
    if (user.passwordChangedAt) {
      const changedAt = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000) * 1000
      if (payload.iat * 1000 < changedAt) return null
    }
    return user
  } catch {
    return null
  }
}

function attachUser(req, _res, next) {
  req.user = readSession(req)
  next()
}
app.use(attachUser)

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: '请先登录。' })
  next()
}

function userSummary(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
  }
}

function publicPhoto(photo) {
  const {
    id,
    title,
    description,
    rating,
    width,
    height,
    aspectRatio,
    dateTaken,
    dateTakenSource,
    originalName,
    storageKey,
    thumbnailKey,
    fileSize,
    lastModified,
    originalUrl,
    thumbnailUrl,
    thumbnailHash,
    tags,
    exif,
    latitude,
    longitude,
    country,
    city,
    locationName,
    geocoding,
    isLivePhoto,
    livePhotoVideoUrl,
    livePhotoVideoKey,
  } = photo
  return {
    id,
    title,
    description,
    rating,
    width,
    height,
    aspectRatio,
    dateTaken,
    dateTakenSource: dateTakenSource || null,
    originalName: originalName || null,
    storageKey,
    thumbnailKey,
    fileSize,
    lastModified,
    originalUrl,
    thumbnailUrl,
    thumbnailHash,
    tags,
    exif,
    latitude,
    longitude,
    // 高德底图与地理编码都是 GCJ-02，服务端统一换算，避免前端标记点整体偏移数百米
    gcj02:
      typeof latitude === 'number' && typeof longitude === 'number'
        ? wgs84ToGcj02(longitude, latitude)
        : null,
    country,
    city,
    locationName,
    geocoding: geocoding || null,
    albumIds: Array.isArray(photo.albumIds) ? photo.albumIds : [],
    isLivePhoto,
    livePhotoVideoUrl,
    livePhotoVideoKey,
  }
}

function publicAlbum(album) {
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    coverPhotoId: album.coverPhotoId,
    isHidden: album.isHidden,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    photoIds: album.photoIds,
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: '请填写邮箱和密码。' })
  }
  const user = getDb().users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase() || u.username === email.trim(),
  )
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: '邮箱或密码不正确。' })
  }
  const token = createSession(user)
  res.cookie('memora_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
  res.json({ success: true, user: userSummary(user) })
})

app.post('/api/logout', (req, res) => {
  res.clearCookie('memora_session', { path: '/' })
  res.json({ success: true })
})

app.get('/api/profile', (req, res) => {
  if (!req.user) return res.json(null)
  res.json(userSummary(req.user))
})

app.post('/api/profile', requireAuth, (req, res) => {
  const { username, email, avatar } = req.body || {}
  const user = req.user
  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ message: '用户名太短。' })
    }
    user.username = username.trim().slice(0, 40)
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '邮箱格式不正确。' })
    }
    user.email = email.trim()
  }
  if (avatar !== undefined) {
    // 走和上传同一套逻辑：同步 settings.app.avatarUrl，并清掉被替换掉的旧头像
    const next = String(avatar).trim()
    if (next !== user.avatar) {
      return res.json({ success: true, user: applyAvatar(user, next) })
    }
  }
  saveDb()
  res.json({ success: true, user: userSummary(user) })
})

// ---------------------------------------------------------------------------
// 头像上传
//
// 和照片上传分开：头像只往 user.avatar 写一个 URL，不写 photos 集合，
// 也不生成缩略图对象。七牛模式下同样走「浏览器直传 + 后端只记元数据」，
// 避免函数体大小限制；本地模式用 multer 接住文件交给 sharp 压成 512 方形。
// 写库时顺带把 settings.app.avatarUrl 同步过去，前台（未登录访客）才能看到新头像。
// ---------------------------------------------------------------------------
// 没有头像就是没有：不设任何默认图，前端按空值渲染占位。
const AVATAR_LIMIT_BYTES = 8 * 1024 * 1024

function applyAvatar(user, url) {
  const previous = user.avatar
  const next = url || ''
  user.avatar = next
  const db = getDb()
  db.settings.app = { ...(db.settings.app || {}), avatarUrl: next }
  saveDb()
  if (previous && previous !== next) removeStoredAvatar(previous).catch(() => {})
  return userSummary(user)
}

let avatarMiddleware = null
function getAvatarMiddleware() {
  if (!avatarMiddleware) {
    fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true })
    avatarMiddleware = multer({
      dest: path.join(UPLOAD_DIR, 'tmp'),
      limits: { fileSize: AVATAR_LIMIT_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        try {
          file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
        } catch {}
        // 头像也不能上传 SVG/HTML，同域访问就是 XSS
        const ext = path.extname(file.originalname || '').toLowerCase()
        if (['.svg', '.html', '.htm', '.xhtml', '.xml', '.swf'].includes(ext)) {
          return cb(new Error('不支持此格式，请使用 JPG/PNG/WebP。'))
        }
        const mime = String(file.mimetype || '')
        // 有的系统对 .heic / 无扩展名文件给出空 type 或 octet-stream，
        // 这类交给后面的 sharp 真正解码判断，不在这里一刀切拒掉。
        const unknown = !mime || mime === 'application/octet-stream'
        if (!unknown && !mime.startsWith('image/')) {
          return cb(new Error('只支持上传图片。'))
        }
        cb(null, true)
      },
    })
  }
  return avatarMiddleware
}

app.get('/api/profile/avatar/mode', requireAuth, (_req, res) => {
  res.json({ provider: storageKind(), maxSize: AVATAR_LIMIT_BYTES })
})

app.post('/api/profile/avatar/token', requireAuth, async (req, res, next) => {
  try {
    if (!isQiniuConfigured()) {
      return res.status(400).json({ message: '七牛云尚未配置，无法使用直传。' })
    }
    const { mimeType = 'image/jpeg', size, filename = 'avatar.jpg' } = req.body || {}
    if (!String(mimeType).startsWith('image/')) {
      return res.status(400).json({ message: '只支持上传图片。' })
    }
    const ext = path.extname(String(filename)).toLowerCase()
    if (['.svg', '.html', '.htm', '.xhtml', '.xml', '.swf'].includes(ext)) {
      return res.status(400).json({ message: '不支持此格式，请使用 JPG/PNG/WebP。' })
    }
    const key = makeAvatarKey(req.user.id)
    const target = await createQiniuUploadTarget({
      key,
      mimeType: String(mimeType),
      fileSize: Number(size) || 0,
    })
    res.json({ success: true, ...target })
  } catch (err) {
    next(err)
  }
})

app.post('/api/profile/avatar/complete', requireAuth, async (req, res, next) => {
  try {
    if (!isQiniuConfigured()) {
      return res.status(400).json({ message: '七牛云尚未配置。' })
    }
    const key = String(req.body?.key || '')
    if (!key) return res.status(400).json({ message: '缺少文件标识。' })
    // 只认当前用户自己的头像目录，防止拿这个接口覆盖照片对象
    if (!key.startsWith(avatarKeyPrefix(req.user.id))) {
      return res.status(400).json({ message: '文件标识不匹配。' })
    }
    // 头像不需要宽高/EXIF/缩略图，只要确认对象真的落到了空间里。
    // 用 rs 管理 API 的 stat（≈400ms），不要走 CDN —— 自定义域名的 CDN
    // 只开了海外回源，本机读一次首字节要 7–20s，会把上传拖到半分钟以上。
    const stat = await statQiniuObject(key)
    if (!stat?.exists) {
      return res.status(422).json({ message: '七牛上没有找到这张图片，请确认上传已完成。' })
    }
    res.json({ success: true, user: applyAvatar(req.user, publicUrlFor(key)) })
  } catch (err) {
    next(err)
  }
})

// multer 的错误默认会冒到全局错误中间件，变成一句笼统的 500。
// 头像这里单独接住，给用户能看懂的提示（超限 / 字段名不对 / 非图片）。
function receiveAvatar(req, res, next) {
  getAvatarMiddleware().single('file')(req, res, (err) => {
    if (!err) return next()
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? '头像不能超过 8MB。'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? '上传字段名不正确。'
          : err.message || '上传失败，请重试。'
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message })
  })
}

app.post('/api/profile/avatar', requireAuth, receiveAvatar, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '没有选择文件。' })
  const buffer = fs.readFileSync(req.file.path)
  try {
    fs.unlinkSync(req.file.path)
  } catch {}
  if (buffer.length > AVATAR_LIMIT_BYTES) {
    return res.status(413).json({ message: '头像不能超过 8MB。' })
  }
  let saved
  try {
    saved = await saveLocalAvatar({ buffer, userId: req.user.id })
  } catch {
    return res.status(415).json({ message: '无法解析这张图片，请换一张试试。' })
  }
  res.json({ success: true, user: applyAvatar(req.user, saved.url) })
})

app.delete('/api/profile/avatar', requireAuth, (req, res) => {
  // 移除就是移除，不留默认图占位
  res.json({ success: true, user: applyAvatar(req.user, null) })
})

app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: '请填写两个密码。' })
  }
  if (!bcrypt.compareSync(currentPassword, req.user.passwordHash)) {
    return res.status(400).json({ message: '当前密码不正确。' })
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: '新密码至少 6 位。' })
  }
  req.user.passwordHash = bcrypt.hashSync(newPassword, 10)
  req.user.passwordChangedAt = new Date().toISOString()
  saveDb()
  // passwordChangedAt 会让所有旧 token 立刻失效（readSession 里比对 iat）。
  // 当前这台机器刚改完密码，得给它换一张新票，否则紧接着的请求全变 401。
  res.cookie('memora_session', createSession(req.user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  })
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Public gallery data
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', db: getDriver(), storage: storageKind() }),
)

// 地图页要加载高德 JS API，key 必须下发给浏览器（高德本身靠前端的域名白名单约束）。
// 2021-12-02 之后申请的高德 Key 还需要 securityJsCode，必须在加载脚本前挂到
// window._AMapSecurityConfig，否则瓦片灰显并报 INVALID_USER_SCODE。
app.get('/api/map/config', (_req, res) => {
  const settings = getDb().settings
  res.json({
    provider: settings.map?.provider || 'maplibre',
    key: resolveAmapKey(settings),
    securityCode: resolveAmapSecurityCode(settings),
    style: process.env.AMAP_MAP_STYLE || 'amap://styles/normal',
    styleDark: process.env.AMAP_MAP_STYLE_DARK || 'amap://styles/dark',
  })
})

// ---------------------------------------------------------------------------
// 地图瓦片代理
// 浏览器直连高德瓦片会受 referer / CORS / 运营商劫持影响，表现为 ERR_EMPTY_RESPONSE。
// 这里由服务端统一取瓦片并内存缓存，前端只请求同源 /api/map/tile。
// ---------------------------------------------------------------------------
const TILE_UPSTREAMS = [
  'https://webrd01.is.autonavi.com/appmaptile',
  'https://webrd02.is.autonavi.com/appmaptile',
  'https://webrd03.is.autonavi.com/appmaptile',
  'https://webrd04.is.autonavi.com/appmaptile',
]
const tileCache = new Map()
const TILE_CACHE_MAX = 600

function clampTile(v, max) {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, max)
}

app.get('/api/map/tile', async (req, res) => {
  const z = clampTile(req.query.z, 18)
  if (z === null) return res.status(400).end()
  const max = 2 ** z - 1
  const x = clampTile(req.query.x, max)
  const y = clampTile(req.query.y, max)
  if (x === null || y === null) return res.status(400).end()

  const key = `${z}/${x}/${y}`
  const cached = tileCache.get(key)
  if (cached) {
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')
    return res.send(cached)
  }

  const upstream =
    TILE_UPSTREAMS[(x + y) % TILE_UPSTREAMS.length] +
    `?lang=zh_cn&size=1&scale=1&style=7&x=${x}&y=${y}&z=${z}`
  try {
    const upstreamRes = await fetch(upstream, {
      headers: { Referer: 'https://www.amap.com/', 'User-Agent': 'Memora/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!upstreamRes.ok) return res.status(502).end()
    const buffer = Buffer.from(await upstreamRes.arrayBuffer())
    if (tileCache.size >= TILE_CACHE_MAX) {
      // 简单 FIFO 淘汰，瓦片体积小，不需要 LRU
      tileCache.delete(tileCache.keys().next().value)
    }
    tileCache.set(key, buffer)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch {
    res.status(504).end()
  }
})

app.get('/api/photos/visible', (_req, res) => {
  res.json(listPhotos().map(publicPhoto))
})

app.get('/api/photos', (req, res) => {
  const all = listPhotos({ includeHidden: Boolean(req.user) })
  // 支持分页：不传 limit 时保持老行为（一次返回全部），传了就切片，
  // 并用 X-Total-Count 告诉前端总数，方便边滚边加载。
  const rawLimit = Number(req.query.limit)
  const rawOffset = Number(req.query.offset)
  const hasPaging = Number.isFinite(rawLimit) && rawLimit > 0
  const limit = hasPaging ? Math.min(Math.floor(rawLimit), 200) : all.length
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  const page = hasPaging ? all.slice(offset, offset + limit) : all
  res.set('X-Total-Count', String(all.length))
  res.json(page.map(publicPhoto))
})

app.get('/api/photos/:id', (req, res) => {
  const photo = findPhoto(req.params.id)
  if (!photo || photo.hidden) return res.status(404).json({ message: '照片不存在。' })
  res.json(publicPhoto(photo))
})

app.get('/api/albums', (_req, res) => {
  res.json(listAlbums().map(publicAlbum))
})

app.get('/api/albums/:id', (req, res) => {
  const album = findAlbum(req.params.id)
  if (!album) return res.status(404).json({ message: '相册不存在。' })
  res.json(publicAlbum(album))
})

app.get('/api/photos/:id/reactions', (req, res) => {
  const rows = getDb().reactions.filter((r) => r.photoId === req.params.id)
  const counts = {}
  for (const row of rows) counts[row.type] = (counts[row.type] || 0) + 1
  const mine = rows.find((r) => r.fingerprint === req.query.fingerprint)?.type || null
  res.json({ counts, mine })
})

app.post('/api/photos/:id/reactions', reactionLimiter, (req, res) => {
  const { type, fingerprint } = req.body || {}
  const allowed = ['like', 'love', 'amazing', 'funny', 'wow', 'sad', 'fire', 'sparkle']
  if (!allowed.includes(type) || typeof fingerprint !== 'string') {
    return res.status(400).json({ message: '表态类型无效。' })
  }
  const db = getDb()
  const index = db.reactions.findIndex(
    (r) => r.photoId === req.params.id && r.fingerprint === fingerprint,
  )
  if (index >= 0) {
    if (db.reactions[index].type === type) db.reactions.splice(index, 1)
    else db.reactions[index].type = type
  } else {
    db.reactions.push({
      photoId: req.params.id,
      type,
      fingerprint,
      createdAt: new Date().toISOString(),
    })
  }
  saveDb()
  const rows = db.reactions.filter((r) => r.photoId === req.params.id)
  const counts = {}
  for (const row of rows) counts[row.type] = (counts[row.type] || 0) + 1
  const mine = rows.find((r) => r.fingerprint === fingerprint)?.type || null
  res.json({ counts, mine })
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
app.get('/api/system/settings/all', (_req, res) => {
  res.json({ data: publicSettings(), timestamp: Date.now() })
})

app.get('/api/system/settings/fields', requireAuth, (_req, res) => {
  res.json({ data: publicSettings() })
})

app.post('/api/system/settings/batch', requireAuth, (req, res) => {
  const data = req.body?.data || req.body
  const next = saveSettings(data)
  res.json({ success: true, data: next })
})

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
app.get('/api/admin/stats', requireAuth, (_req, res) => {
  const info = stats()
  const photos = listPhotos({ includeHidden: true })
  const albums = listAlbums()
  res.json({
    ...info,
    recentPhotos: photos.slice(0, 8).map(publicPhoto),
    albumSummary: albums.map((a) => ({
      id: a.id,
      title: a.title,
      count: a.photoIds.length,
      coverPhotoId: a.coverPhotoId,
    })),
    recentTags: info.tags.slice(0, 14),
    cameras: [
      ...new Set(
        photos
          .map((p) => p.exif?.Model)
          .filter(Boolean),
      ),
    ],
  })
})

// 设置页里 system:upload.* / privacy:upload.* 的读取口。这两个分组以前只
// 能存不能读（传上去没人用），现在上传链路真正按它们行事。
const HARD_UPLOAD_CEILING = 40 * 1024 * 1024

function uploadSettings() {
  const settings = getDb().settings || {}
  const system = settings.system || {}
  const configured = Number(system['upload.maxFileSize'])
  const limitMb = Number.isFinite(configured) && configured > 0 ? configured : 40
  const maxFileSize = Math.min(Math.round(limitMb * 1024 * 1024), HARD_UPLOAD_CEILING)
  const mode = system['upload.duplicateCheck.mode'] === 'overwrite' ? 'overwrite' : 'skip'
  return {
    limitMb,
    maxFileSize,
    duplicateCheck: {
      // 老数据里可能没有这个键，缺省按开启处理（前端默认也是开）
      enabled: system['upload.duplicateCheck.enabled'] !== false,
      mode,
    },
    autoEraseLocation: (settings.privacy || {})['upload.autoEraseLocation'] === true,
  }
}

function uploadLimitMessage() {
  const { limitMb } = uploadSettings()
  return `文件超过 ${limitMb}MB 上限，请先压缩后再上传。`
}

// 本地开发用 multer 落临时目录；七牛模式下浏览器直传，根本不经过这里
let uploadMiddleware = null
let uploadMiddlewareLimit = 0
function getUploadMiddleware() {
  const { maxFileSize } = uploadSettings()
  if (uploadMiddleware && uploadMiddlewareLimit === maxFileSize) return uploadMiddleware
  fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true })
  uploadMiddlewareLimit = maxFileSize
  uploadMiddleware = multer({
    dest: path.join(UPLOAD_DIR, 'tmp'),
    limits: { fileSize: maxFileSize, files: 12 },
    // multer 默认按 latin1 解码文件名，中文会变乱码，这里转回 UTF-8
    fileFilter: (_req, file, cb) => {
      try {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
      } catch {}
      // 拒绝 SVG / HTML / 非图片：SVG 里能内嵌 <script>，同域访问就是存储型 XSS
      const ext = path.extname(file.originalname || '').toLowerCase()
      const blockExt = ['.svg', '.html', '.htm', '.xhtml', '.xml', '.swf']
      if (blockExt.includes(ext)) return cb(new Error('不支持此格式，请转换为 JPG/PNG/WebP 后再上传。'))
      const mime = String(file.mimetype || '')
      if (mime && !mime.startsWith('image/')) return cb(new Error('只支持上传图片。'))
      cb(null, true)
    },
  })
  return uploadMiddleware
}

function toIsoDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function round(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number(value.toFixed(digits))
}

// Windows 资源管理器写入的 XP* 标签（XPTitle/XPComment/XPKeywords/XPAuthor）
// 是 UTF-16LE 的原始字节，而 IPTC 的 Caption/Keywords 是 UTF-8 字符串。
// exifr 自带的 UCS-2 reviver 按大端解，中文会整段变乱码，所以这里拿原始字节
// 自己判断编码：先按 UTF-8 试，出现替换字符或控制字符就改按 UTF-16 解。
function decodeTagText(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.replace(/\u0000+$/g, '').trim()
  if (typeof value === 'number') return String(value)
  let bytes = null
  if (Buffer.isBuffer(value)) bytes = value
  else if (value instanceof Uint8Array) bytes = Buffer.from(value)
  else return ''
  if (!bytes.length) return ''

  const strip = (text) => text.replace(/\u0000+$/g, '').trim()
  const looksBroken = (text) => /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)

  const asUtf8 = strip(bytes.toString('utf8'))
  if (asUtf8 && !looksBroken(asUtf8)) return asUtf8

  const asLe = strip(bytes.toString('utf16le'))
  if (asLe && !looksBroken(asLe)) return asLe

  // 字节序反了：两两交换后再按 UTF-16LE 解
  const swapped = Buffer.from(bytes)
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const a = swapped[i]
    swapped[i] = swapped[i + 1]
    swapped[i + 1] = a
  }
  const asBe = strip(swapped.toString('utf16le'))
  return looksBroken(asBe) ? '' : asBe
}

function splitTagList(value) {
  const text = decodeTagText(value)
  if (!text) return []
  return text
    .split(/[;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40)
}

// 只保留我们真正落库的 EXIF 字段，其余丢弃以控制 db 体积。
// 同时把「标题/描述/标签/评分」这些能自动填的文案抽出来（meta），
// 它们进的是照片的顶层字段，不是 exif 展示区。
async function parseExif(source) {
  try {
    const parsed = await exifr.parse(source, { tiff: true, exif: true, gps: true, iptc: true })
    if (!parsed) return { exif: {}, meta: {} }
    const exif = {
      Make: parsed.Make,
      Model: parsed.Model,
      LensModel: parsed.LensModel,
      FNumber: parsed.FNumber,
      Aperture: parsed.ApertureValue ? Math.pow(2, parsed.ApertureValue / 2) : parsed.FNumber,
      ExposureTime: parsed.ExposureTime,
      ISO: parsed.ISO,
      FocalLength: parsed.FocalLength,
      FocalLengthIn35mmFormat: parsed.FocalLengthIn35mmFormat,
      ColorSpace: parsed.ColorSpace,
      ExposureProgram: parsed.ExposureProgram,
      MeteringMode: parsed.MeteringMode,
      Flash: parsed.Flash,
      BrightnessValue: parsed.BrightnessValue,
      SensingMethod: parsed.SensingMethod,
      DateTimeOriginal: parsed.DateTimeOriginal?.toISOString?.() || parsed.DateTimeOriginal,
      CreateDate: parsed.CreateDate?.toISOString?.() || parsed.CreateDate,
      GPSLatitude: parsed.latitude,
      GPSLongitude: parsed.longitude,
    }
    for (const key of Object.keys(exif)) {
      if (exif[key] === undefined) delete exif[key]
    }

    // 第二次解析只为了拿原始字节的 XP*/IPTC 文案，reviveValues 关掉才不会
    // 被 exifr 的 UCS-2 reviver 弄成乱码。
    let raw = null
    try {
      raw = await exifr.parse(source, {
        tiff: true,
        iptc: true,
        translateKeys: true,
        reviveValues: false,
        pick: [
          'XPTitle',
          'XPComment',
          'XPKeywords',
          'ImageDescription',
          'ObjectName',
          'Caption',
          'Keywords',
          'Rating',
        ],
      })
    } catch {
      raw = null
    }

    const meta = {}
    const title =
      decodeTagText(raw?.XPTitle) || decodeTagText(raw?.ObjectName) || decodeTagText(parsed?.ObjectName)
    if (title) meta.title = title.slice(0, 120)
    const description =
      decodeTagText(parsed?.ImageDescription) ||
      decodeTagText(raw?.ImageDescription) ||
      decodeTagText(raw?.XPComment) ||
      decodeTagText(parsed?.Caption) ||
      decodeTagText(raw?.Caption)
    if (description) meta.description = description.slice(0, 2000)
    const tags = splitTagList(raw?.XPKeywords).length
      ? splitTagList(raw?.XPKeywords)
      : splitTagList(parsed?.Keywords)
    if (tags.length) meta.tags = tags
    const rating = Number(raw?.Rating ?? parsed?.Rating)
    if (Number.isFinite(rating) && rating > 0) meta.rating = Math.min(5, Math.round(rating))

    return { exif, meta }
  } catch {
    return { exif: {}, meta: {} }
  }
}

// 组装最终落库的照片记录；本地与七牛两条链路共用
async function buildPhotoRecord({
  id,
  title,
  originalName,
  width,
  height,
  fileSize,
  stored,
  exif,
  meta,
  hash,
  fallbackTaken,
}) {
  // 拍摄时间只认真实来源：EXIF 优先，其次是客户端给的「文件修改时间」
  // （手机相册里这个时间通常就是拍摄时间）。两者都没有就留空，
  // 绝不能拿服务器当前时间顶上——那会让截图看起来像是刚拍的。
  const exifTaken = toIsoDate(exif.DateTimeOriginal) || toIsoDate(exif.CreateDate)
  const fileTaken = exifTaken ? null : toIsoDate(fallbackTaken)
  const taken = exifTaken || fileTaken || null
  const takenSource = exifTaken ? 'exif' : fileTaken ? 'file' : null

  // 隐私开关：勾了「上传时自动清除位置信息」就不保留 GPS，也不再反查城市，
  // 否则照片信息面板里会立刻把拍摄地暴露出来。
  const { autoEraseLocation } = uploadSettings()
  let latitude = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : null
  let longitude = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : null
  delete exif.GPSLatitude
  delete exif.GPSLongitude
  if (autoEraseLocation) {
    latitude = null
    longitude = null
  }

  // EXIF 里能读到的文案优先于文件名；读不到才退回上传时的文件名。
  const autoTitle = String(meta?.title || '').trim()
  const photo = {
    id,
    title: String(autoTitle || title || '未命名').slice(0, 120),
    description: String(meta?.description || '').slice(0, 2000),
    width,
    height,
    aspectRatio: width && height ? round(width / height, 4) : 1,
    dateTaken: taken,
    // 拍摄时间从哪来的：exif / file / null（未知）。前端据此决定显示还是留空，
    // 以及是否提示「这张图没有拍摄时间」。
    dateTakenSource: takenSource,
    // 原文件名只在展示和下载时用，存储 key 仍然是 id（避免中文/空格进 URL）。
    originalName: originalName ? String(originalName).slice(0, 255) : null,
    storageKey: stored.storageKey,
    thumbnailKey: stored.thumbnailKey,
    fileSize: fileSize ?? stored.fileSize ?? null,
    lastModified: new Date().toISOString(),
    originalUrl: stored.originalUrl,
    thumbnailUrl: stored.thumbnailUrl,
    thumbnailHash: null,
    tags: Array.isArray(meta?.tags) ? meta.tags.slice(0, 40) : [],
    exif,
    latitude,
    longitude,
    country: null,
    city: null,
    locationName: null,
    geocoding: null,
    isLivePhoto: 0,
    livePhotoVideoUrl: null,
    livePhotoVideoKey: null,
    hidden: false,
    albumIds: [],
    contentHash: hash || null,
  }
  if (meta?.rating) photo.rating = meta.rating

  if (latitude !== null && longitude !== null) {
    const geo = await reverseGeocode({
      latitude,
      longitude,
      key: resolveAmapWebServiceKey(getDb().settings),
    })
    if (geo) {
      photo.country = geo.country
      photo.city = geo.city
      photo.locationName = geo.locationName
      photo.geocoding = geo
    }
  }

  return photo
}

// 重复检测：按内容指纹在现有照片里找同一个文件。
// 只看在册照片，回收站里的不算——用户删掉再传一遍是合理行为。
function findDuplicate(hash) {
  if (!hash) return null
  return getDb().photos.find((p) => p.contentHash && p.contentHash === hash) || null
}

// 入库前的重复处理。返回 { photo, duplicate }，duplicate ∈ null|'skip'|'overwrite'。
// skip：不新增记录，直接把已有那张返回给前端（前端会提示「已存在」）。
// overwrite：保留原记录 id，用新文件替换它的图片字段，旧文件从存储里删掉。
async function storeNewPhoto({ photo, albumId }) {
  const { duplicateCheck } = uploadSettings()
  const existing = duplicateCheck.enabled ? findDuplicate(photo.contentHash) : null

  if (existing && duplicateCheck.mode === 'skip') {
    return { photo: existing, duplicate: 'skip' }
  }

  if (existing) {
    const merged = updatePhoto(existing.id, {
      ...photo,
      id: existing.id,
      albumIds: existing.albumIds || [],
    })
    await removeStoredImage(existing)
    attachToAlbum(merged, albumId)
    return { photo: merged, duplicate: 'overwrite' }
  }

  addPhoto(photo)
  attachToAlbum(photo, albumId)
  return { photo, duplicate: null }
}

function attachToAlbum(photo, albumId) {
  if (!albumId) return
  const album = findAlbum(albumId)
  if (!album) return
  photo.albumIds = [Number(albumId)]
  album.coverPhotoId = album.coverPhotoId || photo.id
  getDb().albumPhotos.push({
    albumId: Number(albumId),
    photoId: photo.id,
    position: album.photoIds.length,
  })
  saveDb()
}

// ---------------------------------------------------------------------------
// 七牛云直传：浏览器 → 七牛，绕开函数体大小限制
// ---------------------------------------------------------------------------
app.get('/api/admin/upload/mode', requireAuth, (_req, res) => {
  const { maxFileSize, limitMb, duplicateCheck } = uploadSettings()
  res.json({ provider: storageKind(), maxFileSize, limitMb, duplicateCheck })
})

app.post('/api/admin/upload/token', requireAuth, async (req, res) => {
  if (!isQiniuConfigured()) {
    return res.status(400).json({ message: '七牛云尚未配置，无法使用直传。' })
  }
  const { filename = 'photo.jpg', mimeType = 'image/jpeg', size, fileSize } = req.body || {}
  if (!String(mimeType).startsWith('image/')) {
    return res.status(400).json({ message: '只支持上传图片。' })
  }
  // 七牛模式虽然是浏览器直传，但后端会生成缩略图并入库——拒绝 SVG 等可执行格式
  const ext = path.extname(String(filename)).toLowerCase()
  const blockExt = ['.svg', '.html', '.htm', '.xhtml', '.xml', '.swf']
  if (blockExt.includes(ext)) {
    return res.status(400).json({ message: '不支持此格式，请转换为 JPG/PNG/WebP 后再上传。' })
  }
  // 七牛是浏览器直传，multer 的体积限制管不到这里，必须在发凭证前挡一次
  const declaredSize = Number(size ?? fileSize) || 0
  const { maxFileSize } = uploadSettings()
  if (declaredSize > maxFileSize) {
    return res.status(413).json({ message: uploadLimitMessage() })
  }
  const id = newPhotoId(String(filename))
  const key = makeObjectKey(id, String(filename))
  const target = await createQiniuUploadTarget({
    key,
    mimeType: String(mimeType),
    fileSize: declaredSize,
  })
  res.json({ success: true, id, ...target })
})

app.post('/api/admin/upload/complete', requireAuth, async (req, res) => {
  if (!isQiniuConfigured()) {
    return res.status(400).json({ message: '七牛云尚未配置。' })
  }
  const { id, key, filename = 'photo.jpg', albumId = null, lastModified = null } = req.body || {}
  if (!id || !key) return res.status(400).json({ message: '缺少文件标识。' })

  const probe = await probeQiniuImage(String(key))
  if (!probe.width || !probe.height) {
    return res
      .status(422)
      .json({ message: '七牛上没有找到这张图片，请确认上传已完成后再提交。' })
  }

  // 缩略图落成真实对象（不依赖 URL query，见 server/storage.js 的说明）。
  // 生成失败不阻塞入库，前端会回退到原图。
  let thumbnailUrl = probe.thumbnailUrl
  let thumbnailKey = probe.thumbnailKey
  try {
    await generateQiniuThumbnail(String(key))
  } catch (err) {
    console.warn('[upload] 缩略图生成失败，回退原图:', err.message)
    thumbnailUrl = probe.publicUrl
    thumbnailKey = String(key)
  }

  const { exif, meta } = probe.exifBuffer ? await parseExif(probe.exifBuffer) : { exif: {}, meta: {} }
  const stored = {
    storageKey: String(key),
    thumbnailKey,
    originalUrl: probe.publicUrl,
    thumbnailUrl,
    fileSize: probe.fileSize,
  }
  const photo = await buildPhotoRecord({
    id: String(id),
    title: path.basename(String(filename), path.extname(String(filename))),
    originalName: String(filename),
    width: probe.width,
    height: probe.height,
    fileSize: probe.fileSize,
    stored,
    exif,
    meta,
    hash: probe.hash || null,
    fallbackTaken: lastModified,
  })
  const { photo: saved, duplicate } = await storeNewPhoto({ photo, albumId })
  res.json({ success: true, duplicate, photos: [publicPhoto(saved)] })
})

// ---------------------------------------------------------------------------
// 本地上传（开发环境 / 未配置七牛时）
// ---------------------------------------------------------------------------
app.post(
  '/api/admin/upload',
  requireAuth,
  (req, res, next) => getUploadMiddleware().array('files', 12)(req, res, next),
  async (req, res) => {
    const files = req.files || []
    if (!files.length) return res.status(400).json({ message: '没有选择文件。' })
    const albumId = req.body?.albumId ? Number(req.body.albumId) : null
    // 前端把每个文件的 lastModified 按顺序塞进来（无 EXIF 时用作拍摄时间兜底）
    const clientTimes = (() => {
      const raw = req.body?.lastModified
      if (!raw) return []
      try {
        const list = JSON.parse(raw)
        return Array.isArray(list) ? list : []
      } catch {
        return []
      }
    })()
    const created = []
    const skipped = []

    for (const [index, file] of files.entries()) {
      const id = newPhotoId(file.originalname)
      const buffer = fs.readFileSync(file.path)
      let stored
      try {
        stored = await saveLocalImage({ buffer, id, originalName: file.originalname })
      } catch {
        try {
          fs.unlinkSync(file.path)
        } catch {}
        continue
      }
      try {
        fs.unlinkSync(file.path)
      } catch {}

      const { exif, meta } = await parseExif(buffer)
      const photo = await buildPhotoRecord({
        id,
        title: path.basename(file.originalname, path.extname(file.originalname)),
        originalName: file.originalname,
        width: stored.width,
        height: stored.height,
        fileSize: stored.fileSize,
        stored,
        exif,
        meta,
        hash: contentHash(buffer),
        // 浏览器给的 file.lastModified，按上传顺序一一对应
        fallbackTaken: clientTimes[index] ?? null,
      })
      const { photo: saved, duplicate: dup } = await storeNewPhoto({ photo, albumId })
      if (dup === 'skip') {
        // 跳过的照片没有用到刚存下的文件，直接清掉，别在磁盘上留垃圾
        await removeStoredImage(photo)
        skipped.push(file.originalname)
        continue
      }
      created.push(publicPhoto(saved))
    }

    res.json({ success: true, photos: created, skipped })
  },
)

app.patch('/api/admin/photos/:id', requireAuth, (req, res) => {
  const photo = findPhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '照片不存在。' })
  const body = req.body || {}
  const patch = {}
  if (body.title !== undefined) patch.title = String(body.title).slice(0, 200)
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000)
  if (body.dateTaken !== undefined) {
    patch.dateTaken = body.dateTaken ? toIsoDate(body.dateTaken) : null
    // 手动改过拍摄时间后，来源标记也要跟着变，否则前端还以为是 EXIF 推断的
    patch.dateTakenSource = patch.dateTaken ? 'manual' : null
  }
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.slice(0, 40) : []
  if (body.latitude !== undefined) {
    // 空字符串 / null 表示「清除坐标」；非法或超范围的值一律拒绝，避免存进脏数据。
    if (body.latitude === null || body.latitude === '') {
      patch.latitude = null
      patch.geocoding = null
    } else {
      const value = Number(body.latitude)
      if (!Number.isFinite(value) || value < -90 || value > 90) {
        return res.status(400).json({ message: '纬度需要在 -90 到 90 之间。' })
      }
      patch.latitude = value
      patch.geocoding = null
    }
  }
  if (body.longitude !== undefined) {
    if (body.longitude === null || body.longitude === '') {
      patch.longitude = null
      patch.geocoding = null
    } else {
      const value = Number(body.longitude)
      if (!Number.isFinite(value) || value < -180 || value > 180) {
        return res.status(400).json({ message: '经度需要在 -180 到 180 之间。' })
      }
      patch.longitude = value
      patch.geocoding = null
    }
  }
  if (body.city !== undefined) patch.city = body.city || null
  if (body.country !== undefined) patch.country = body.country || null
  if (body.locationName !== undefined) patch.locationName = body.locationName || null
  if (body.hidden !== undefined) patch.hidden = Boolean(body.hidden)
  if (body.rating !== undefined) patch.rating = Math.max(0, Math.min(5, Number(body.rating) || 0))
  if (body.albumIds !== undefined) {
    const db = getDb()
    const ids = (Array.isArray(body.albumIds) ? body.albumIds : []).map(Number)
    db.albumPhotos = db.albumPhotos.filter((ap) => ap.photoId !== photo.id)
    for (const albumId of ids) {
      // 同样要拿 db 里的原始对象，findAlbum() 给的是副本，改封面不会落库。
      const album = db.albums.find((a) => a.id === albumId)
      if (!album) continue
      const position = db.albumPhotos.filter((ap) => ap.albumId === albumId).length
      db.albumPhotos.push({ albumId, photoId: photo.id, position })
      if (!album.coverPhotoId) album.coverPhotoId = photo.id
    }
    photo.albumIds = ids
  }
  const updated = updatePhoto(photo.id, patch)
  res.json({ success: true, photo: publicPhoto(updated) })
})

app.post('/api/admin/photos/:id/geocode', requireAuth, async (req, res) => {
  const photo = findPhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '照片不存在。' })
  // 允许用请求体里的坐标覆盖库里的值，这样在编辑弹窗里手填经纬度后可以直接识别，
  // 不用先保存一次。
  const bodyLat = Number(req.body?.latitude)
  const bodyLon = Number(req.body?.longitude)
  const hasBodyCoords = Number.isFinite(bodyLat) && Number.isFinite(bodyLon)
  const latitude = hasBodyCoords ? bodyLat : photo.latitude
  const longitude = hasBodyCoords ? bodyLon : photo.longitude
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ message: '这张照片没有经纬度，无法自动识别位置。' })
  }
  const geo = await reverseGeocode({
    latitude,
    longitude,
    key: resolveAmapWebServiceKey(getDb().settings),
  })
  if (!geo) return res.status(502).json({ message: '高德没有返回可用位置，请手动填写。' })
  const saved = updatePhoto(photo.id, {
    ...(hasBodyCoords ? { latitude, longitude } : {}),
    country: geo.country,
    city: geo.city,
    locationName: geo.locationName,
    geocoding: geo,
  })
  res.json({ success: true, photo: publicPhoto(saved) })
})

app.delete('/api/admin/photos/:id', requireAuth, (req, res) => {
  const photo = moveToTrash(req.params.id)
  if (!photo) return res.status(404).json({ message: '照片不存在。' })
  res.json({ success: true })
})

app.post('/api/admin/photos/:id/restore', requireAuth, (req, res) => {
  const photo = restorePhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '回收站里没有这张照片。' })
  res.json({ success: true, photo: publicPhoto(photo) })
})

app.delete('/api/admin/photos/:id/purge', requireAuth, async (req, res) => {
  const photo = purgePhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '回收站里没有这张照片。' })
  await removeStoredImage(photo)
  res.json({ success: true })
})

app.get('/api/admin/trash', requireAuth, (_req, res) => {
  res.json(getDb().trash.map((p) => ({ ...publicPhoto(p), deletedAt: p.deletedAt })))
})

app.post('/api/admin/photos/batch-delete', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const deleted = []
  for (const id of ids) {
    const photo = moveToTrash(id)
    if (photo) deleted.push(id)
  }
  res.json({ success: true, deleted })
})

app.post('/api/admin/photos/batch-restore', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const restored = []
  for (const id of ids) {
    if (restorePhoto(id)) restored.push(id)
  }
  res.json({ success: true, restored })
})

app.post('/api/admin/photos/batch-purge', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const purged = []
  const failed = []
  // 逐个删对象存储：七牛那边每张要删原图+缩略图并刷新 CDN，并发打过去容易被限流
  for (const id of ids) {
    const photo = purgePhoto(id)
    if (!photo) continue
    try {
      await removeStoredImage(photo)
      purged.push(id)
    } catch {
      // 记录已删掉，对象存储清理失败不该让整批回滚
      failed.push(id)
    }
  }
  res.json({ success: true, purged, failed })
})

// Albums
app.get('/api/admin/albums', requireAuth, (_req, res) => {
  res.json(listAlbums().map(publicAlbum))
})

app.post('/api/admin/albums', requireAuth, (req, res) => {
  const { title, description = '' } = req.body || {}
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: '请填写相册标题。' })
  }
  const db = getDb()
  const album = {
    id: Math.max(0, ...db.albums.map((a) => a.id)) + 1,
    title: title.trim().slice(0, 120),
    description: String(description).slice(0, 1000),
    coverPhotoId: null,
    isHidden: false,
    passwordHash: null,
    position: db.albums.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    photoIds: [],
  }
  db.albums.push(album)
  saveDb()
  res.json({ success: true, album: publicAlbum(album) })
})

app.patch('/api/admin/albums/:id', requireAuth, (req, res) => {
  const album = getDb().albums.find((a) => a.id === Number(req.params.id))
  if (!album) return res.status(404).json({ message: '相册不存在。' })
  const { title, description, coverPhotoId, isHidden } = req.body || {}
  if (title !== undefined) album.title = String(title).trim().slice(0, 120)
  if (description !== undefined) album.description = String(description).slice(0, 1000)
  if (coverPhotoId !== undefined) album.coverPhotoId = coverPhotoId || null
  if (isHidden !== undefined) album.isHidden = Boolean(isHidden)
  album.updatedAt = new Date().toISOString()
  saveDb()
  res.json({ success: true, album: publicAlbum(findAlbum(album.id)) })
})

app.delete('/api/admin/albums/:id', requireAuth, (req, res) => {
  const db = getDb()
  const id = Number(req.params.id)
  const index = db.albums.findIndex((a) => a.id === id)
  if (index === -1) return res.status(404).json({ message: '相册不存在。' })
  db.albums.splice(index, 1)
  db.albumPhotos = db.albumPhotos.filter((ap) => ap.albumId !== id)
  for (const photo of db.photos) {
    if (Array.isArray(photo.albumIds)) photo.albumIds = photo.albumIds.filter((a) => a !== id)
  }
  saveDb()
  res.json({ success: true })
})

app.put('/api/admin/albums/:id/photos', requireAuth, (req, res) => {
  // 注意：findAlbum() 返回的是 listAlbums() 展开后的副本，改它不会落库，
  // 这里必须直接拿 db 里的原始对象。
  const album = getDb().albums.find((a) => a.id === Number(req.params.id))
  if (!album) return res.status(404).json({ message: '相册不存在。' })
  const photoIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds : []
  const db = getDb()
  db.albumPhotos = db.albumPhotos.filter((ap) => ap.albumId !== album.id)
  photoIds.forEach((photoId, index) => {
    if (findPhoto(photoId)) {
      db.albumPhotos.push({ albumId: album.id, photoId, position: index })
      const photo = findPhoto(photoId)
      photo.albumIds = [...new Set([...(photo.albumIds || []), album.id])]
    }
  })
  // 允许前端指定封面；指定的照片必须还在相册里，否则退回第一张。
  const requestedCover = req.body?.coverPhotoId
  album.coverPhotoId =
    requestedCover && photoIds.includes(requestedCover) ? requestedCover : photoIds[0] || null
  album.updatedAt = new Date().toISOString()
  saveDb()
  res.json({ success: true, album: publicAlbum(findAlbum(album.id)) })
})

app.patch('/api/admin/albums/:id/reorder', requireAuth, (req, res) => {
  const album = findAlbum(req.params.id)
  if (!album) return res.status(404).json({ message: '相册不存在。' })
  const ids = Array.isArray(req.body?.photoIds) ? req.body.photoIds : []
  const db = getDb()
  db.albumPhotos = db.albumPhotos.filter((ap) => ap.albumId !== album.id)
  ids.forEach((photoId, index) =>
    db.albumPhotos.push({ albumId: album.id, photoId, position: index }),
  )
  saveDb()
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Static files / SPA
// ---------------------------------------------------------------------------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))
app.use('/seed-thumbs', express.static(path.join(ROOT, 'public', 'seed-thumbs'), { maxAge: '7d' }))
app.use('/brand', express.static(path.join(ROOT, 'public', 'brand'), { maxAge: '7d' }))
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '7d' }))

// dist 目录可能在多个位置（本地开发在项目根，EdgeOne Cloud Functions
// 打包后可能在 process.cwd()），逐个尝试，找到第一个存在的。
const distCandidates = [
  path.join(ROOT, 'dist'),
  path.join(process.cwd(), 'dist'),
  path.resolve(import.meta.dirname, 'dist'),
]
const distDir = distCandidates.find((d) => fs.existsSync(d)) || path.join(ROOT, 'dist')
const distIndexFile = path.join(distDir, 'index.html')

// dist/index.html 每次构建都会变，按 mtime 缓存一份原始 HTML，避免每个请求都读盘。
let indexHtmlCache = { html: '', mtimeMs: 0 }
function readIndexHtml() {
  const { mtimeMs } = fs.statSync(distIndexFile)
  if (indexHtmlCache.html && indexHtmlCache.mtimeMs === mtimeMs) return indexHtmlCache.html
  const html = fs.readFileSync(distIndexFile, 'utf8')
  indexHtmlCache = { html, mtimeMs }
  return html
}

// 把设置里的「访问统计」脚本注入到 SPA 外壳里。存的是原始 HTML 片段，直接拼进去。
function injectAnalytics(html) {
  const analytics = getDb().settings?.analytics || {}
  const head = String(analytics.headScripts || '').trim()
  const body = String(analytics.bodyScripts || '').trim()
  let output = html
  if (head) output = output.replace('</head>', `    ${head}\n  </head>`)
  if (body) output = output.replace('</body>', `    ${body}\n  </body>`)
  return output
}

const sendSpaShell = (req, res) => {
  try {
    res.type('html')
    res.set('Cache-Control', 'no-cache')
    res.send(injectAnalytics(readIndexHtml()))
  } catch (error) {
    console.error('[spa]', error)
    res.status(500).send('页面加载失败。')
  }
}

if (fs.existsSync(distDir)) {
  console.log(`[spa] serving dist from ${distDir}`)
  // /index.html 直接走注入路由，否则 express.static 会吐出未注入的原始文件。
  app.get('/index.html', sendSpaShell)
  app.use(express.static(distDir, { index: false }))
} else {
  console.error(`[spa] dist dir not found, tried: ${distCandidates.join(', ')}`)
}

// SPA catch-all：非 /api 的 GET 请求都返回 index.html，让前端路由接管。
// 不管 dist 是否存在都注册——不存在时 sendSpaShell 会返回 500 并打日志，
// 至少能在控制台看到原因，而不是静默 404。
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  sendSpaShell(req, res)
})

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: '页面不存在。' })
  }
  res.status(404).send('页面不存在。')
})

const UPLOAD_LIMIT_MESSAGES = {
  LIMIT_FILE_COUNT: '一次最多上传 12 个文件。',
  LIMIT_UNEXPECTED_FILE: '上传字段名不正确。',
}

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  const isLimit = err?.code === 'LIMIT_FILE_SIZE'
  const message = isLimit
    ? uploadLimitMessage()
    : UPLOAD_LIMIT_MESSAGES[err?.code] || '服务器出错，请稍后重试。'
  res.status(isLimit ? 413 : 500).json({ message })
})

// ---------------------------------------------------------------------------
// 启动
//
// 同一份 app 有两种跑法：
//   1. 本地 / 自托管：node server/index.js，自己 listen 端口
//   2. EdgeOne Cloud Functions：import 这个模块，平台负责监听，
//      **不能 listen**（用 isMain 判断，避免依赖平台特有的环境变量）
// ---------------------------------------------------------------------------
export default app

// ---------------------------------------------------------------------------
// 启动
//
// 同一份 app 有两种跑法：
//   1. 本地 / 自托管：node server/index.js，自己 listen 端口
//   2. EdgeOne Cloud Functions：import 这个模块，平台负责监听，
//      **不能 listen**。
//
// 之前用 process.argv[1] 判断是否为主模块，但 EdgeOne 打包后 argv[1]
// 指向打包后的 /var/user/index.mjs，不等于源文件路径，导致 isMain 失效、
// 函数里也尝试 listen 端口，报 EADDRINUSE。
// 改成：只要环境变量 EDGEONE_FUNCTIONS 为真（或 NODE_ENV=production 且
// 没有 PORT 显式指定），就不 listen。最稳妥的做法是本地启动脚本通过
// MEMORA_LISTEN=1 显式声明要 listen。
// ---------------------------------------------------------------------------
const shouldListen =
  process.env.MEMORA_LISTEN === '1' ||
  process.argv[1]?.endsWith('server/index.js') ||
  process.argv[1]?.endsWith('server\\index.js')

if (shouldListen) {
  ready()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[memora] API server listening on http://localhost:${PORT}`)
        console.log(`[memora] db driver: ${getDriver()} / storage: ${storageKind()}`)
        console.log(`[memora] admin email: ${ADMIN_EMAIL}`)
      })
    })
    .catch((err) => {
      console.error('[memora] 启动失败:', err)
      process.exit(1)
    })
}
