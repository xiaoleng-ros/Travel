import express from 'express'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import sharp from 'sharp'
import exifr from 'exifr'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { resolveAmapKey, reverseGeocode } from './geocode.js'
import {
  UPLOAD_DIR,
  UPLOAD_THUMB_DIR,
  addPhoto,
  findAlbum,
  findPhoto,
  getDb,
  getSettings,
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

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET =
  process.env.JWT_SECRET || 'memora-local-development-secret-please-change-me-2026'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '尝试次数过多，请稍后再试。' },
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
    if (user.passwordChangedAt && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
      return null
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
  if (avatar !== undefined) user.avatar = String(avatar)
  saveDb()
  res.json({ success: true, user: userSummary(user) })
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
  res.json({ success: true })
})

// ---------------------------------------------------------------------------
// Public gallery data
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/photos/visible', (_req, res) => {
  res.json(listPhotos().map(publicPhoto))
})

app.get('/api/photos', (req, res) => {
  res.json(listPhotos({ includeHidden: Boolean(req.user) }).map(publicPhoto))
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

app.post('/api/photos/:id/reactions', (req, res) => {
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

const upload = multer({
  dest: path.join(UPLOAD_DIR, 'tmp'),
  limits: { fileSize: 40 * 1024 * 1024, files: 12 },
})

fs.mkdirSync(path.join(UPLOAD_DIR, 'tmp'), { recursive: true })

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

app.post('/api/admin/upload', requireAuth, upload.array('files', 12), async (req, res) => {
  const files = req.files || []
  if (!files.length) return res.status(400).json({ message: '没有选择文件。' })
  const albumId = req.body?.albumId ? Number(req.body.albumId) : null
  const created = []

  for (const file of files) {
    const id = newPhotoId(file.originalname)
    const originalName = `${id}${(path.extname(file.originalname) || '.jpg').toLowerCase()}`
    const originalPath = path.join(UPLOAD_DIR, originalName)
    fs.renameSync(file.path, originalPath)

    let metadata = {}
    try {
      metadata = await sharp(originalPath).metadata()
    } catch {
      try {
        fs.unlinkSync(originalPath)
      } catch {}
      continue
    }

    const width = metadata.width || null
    const height = metadata.height || null
    const thumbName = `${id}.webp`
    await sharp(originalPath)
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOAD_THUMB_DIR, thumbName))

    let exif = {}
    try {
      const parsed = await exifr.parse(originalPath, {
        tiff: true,
        exif: true,
        gps: true,
        iptc: true,
      })
      if (parsed) {
        exif = {
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
      }
    } catch {}

    const taken =
      toIsoDate(exif.DateTimeOriginal) ||
      toIsoDate(exif.CreateDate) ||
      toIsoDate(metadata.exif) ||
      new Date().toISOString()

    const latitude = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : null
    const longitude = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : null
    delete exif.GPSLatitude
    delete exif.GPSLongitude

    const buffer = fs.readFileSync(originalPath)
    const hash = crypto.createHash('sha1').update(buffer).digest('hex')
    const photo = {
      id,
      title: path.basename(file.originalname, path.extname(file.originalname)).slice(0, 120),
      description: '',
      width,
      height,
      aspectRatio: width && height ? round(width / height, 4) : 1,
      dateTaken: taken,
      storageKey: `uploads/${originalName}`,
      thumbnailKey: `uploads/thumbs/${thumbName}`,
      fileSize: buffer.length,
      lastModified: new Date().toISOString(),
      originalUrl: `/uploads/${originalName}`,
      thumbnailUrl: `/uploads/thumbs/${thumbName}`,
      thumbnailHash: null,
      tags: [],
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
      contentHash: hash,
    }
    if (latitude !== null && longitude !== null) {
      const geo = await reverseGeocode({
        latitude,
        longitude,
        key: resolveAmapKey(getDb().settings),
      })
      if (geo) {
        photo.country = geo.country
        photo.city = geo.city
        photo.locationName = geo.locationName
        photo.geocoding = geo
      }
    }
    addPhoto(photo)
    if (albumId) {
      const album = findAlbum(albumId)
      if (album) {
        photo.albumIds = [albumId]
        album.coverPhotoId = album.coverPhotoId || id
        getDb().albumPhotos.push({ albumId, photoId: id, position: album.photoIds.length })
        saveDb()
      }
    }
    created.push(publicPhoto(photo))
  }

  res.json({ success: true, photos: created })
})

app.patch('/api/admin/photos/:id', requireAuth, (req, res) => {
  const photo = findPhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '照片不存在。' })
  const body = req.body || {}
  const patch = {}
  if (body.title !== undefined) patch.title = String(body.title).slice(0, 200)
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000)
  if (body.dateTaken !== undefined) patch.dateTaken = body.dateTaken || null
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.slice(0, 40) : []
  if (body.latitude !== undefined) patch.latitude = Number(body.latitude) || null
  if (body.longitude !== undefined) patch.longitude = Number(body.longitude) || null
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
      const album = findAlbum(albumId)
      if (!album) continue
      db.albumPhotos.push({ albumId, photoId: photo.id, position: album.photoIds.length })
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
  if (typeof photo.latitude !== 'number' || typeof photo.longitude !== 'number') {
    return res.status(400).json({ message: '这张照片没有经纬度，无法自动识别位置。' })
  }
  const geo = await reverseGeocode({
    latitude: photo.latitude,
    longitude: photo.longitude,
    key: resolveAmapKey(getDb().settings),
  })
  if (!geo) return res.status(502).json({ message: '高德没有返回可用位置，请手动填写。' })
  const saved = updatePhoto(photo.id, {
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

app.delete('/api/admin/photos/:id/purge', requireAuth, (req, res) => {
  const photo = purgePhoto(req.params.id)
  if (!photo) return res.status(404).json({ message: '回收站里没有这张照片。' })
  for (const url of [photo.originalUrl, photo.thumbnailUrl]) {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      try {
        fs.unlinkSync(path.join(ROOT, 'public', url.replace(/^\//, '')))
      } catch {}
    }
  }
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
  const album = findAlbum(req.params.id)
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
  album.coverPhotoId = photoIds[0] || null
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

const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: '页面不存在。' })
  }
  res.status(404).send('页面不存在。')
})

const UPLOAD_LIMIT_MESSAGES = {
  LIMIT_FILE_SIZE: '文件超过 40MB 上限。',
  LIMIT_FILE_COUNT: '一次最多上传 12 个文件。',
  LIMIT_UNEXPECTED_FILE: '上传字段名不正确。',
}

app.use((err, _req, res, _next) => {
  console.error('[server]', err)
  res.status(500).json({
    message: UPLOAD_LIMIT_MESSAGES[err?.code] || '服务器出错，请稍后重试。',
  })
})

app.listen(PORT, () => {
  console.log(`[memora] API server listening on http://localhost:${PORT}`)
  console.log(`[memora] admin email: ${ADMIN_EMAIL}`)
})
