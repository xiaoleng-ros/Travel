import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const SEED_DIR = path.join(DATA_DIR, 'seed')

export const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')
export const UPLOAD_THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs')
export const SEED_THUMB_DIR = path.join(ROOT, 'public', 'seed-thumbs')

fs.mkdirSync(UPLOAD_THUMB_DIR, { recursive: true })
fs.mkdirSync(SEED_THUMB_DIR, { recursive: true })

const EMPTY_DB = {
  users: [],
  photos: [],
  albums: [],
  albumPhotos: [],
  settings: {},
  reactions: [],
  trash: [],
  createdAt: new Date().toISOString(),
}

let cache = null
let writeTimer = null

// 用环境变量覆盖已有数据库中的管理员账号（ADMIN_EMAIL / ADMIN_PASSWORD）
// 返回 true 表示发生了变更
function applyAdminEnv(db) {
  const email = process.env.ADMIN_EMAIL?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email && !password) return false
  const admin = db.users.find((u) => u.isAdmin) || db.users[0]
  if (!admin) return false
  let changed = false
  if (email && email !== admin.email) {
    admin.email = email
    console.log(`[admin] email overridden by env: ${email}`)
    changed = true
  }
  if (password) {
    admin.passwordHash = bcrypt.hashSync(password, 10)
    admin.passwordChangedAt = null
    console.log('[admin] password overridden by env: ADMIN_PASSWORD')
    changed = true
  }
  return changed
}

export function getDb() {
  if (cache) return cache
  if (fs.existsSync(DB_FILE)) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    if (applyAdminEnv(cache)) saveDb(true)
    return cache
  }
  cache = seedDatabase()
  saveDb(true)
  return cache
}

export function saveDb(immediate = false) {
  if (!cache) return
  if (immediate) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2))
    return
  }
  clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2))
    } catch (err) {
      console.error('[db] write failed:', err.message)
    }
  }, 80)
}

function readSeed(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SEED_DIR, name), 'utf8'))
  } catch {
    return fallback
  }
}

function safeId(id) {
  return String(id).replace(/[^\w.-]+/g, '_')
}

function seedDatabase() {
  const db = structuredClone(EMPTY_DB)
  const seedPhotos = readSeed('photos.json', [])
  const seedAlbums = readSeed('albums.json', [])
  const seedSettings = readSeed('settings.json', null)

  db.photos = seedPhotos.map((photo) => {
    const thumbFile = `/seed-thumbs/${safeId(photo.id)}.webp`
    return {
      ...photo,
      thumbnailUrl: fs.existsSync(path.join(SEED_THUMB_DIR, `${safeId(photo.id)}.webp`))
        ? thumbFile
        : photo.thumbnailUrl,
      storageKey: photo.storageKey || '',
      thumbnailKey: photo.thumbnailKey || '',
      tags: Array.isArray(photo.tags) ? photo.tags : [],
      exif: photo.exif || {},
      rating: Number(photo.rating ?? photo.exif?.Rating ?? 0) || 0,
      isLivePhoto: photo.isLivePhoto ? 1 : 0,
      hidden: false,
      albumIds: seedAlbums.filter((a) => (a.photoIds || []).includes(photo.id)).map((a) => a.id),
    }
  })

  db.albums = seedAlbums.map((album, index) => ({
    id: album.id,
    title: album.title,
    description: album.description || '',
    coverPhotoId: album.coverPhotoId || null,
    isHidden: Boolean(album.isHidden),
    passwordHash: null,
    position: index,
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    photoIds: album.photoIds || [],
  }))

  for (const album of seedAlbums) {
    ;(album.photoIds || []).forEach((photoId, index) => {
      db.albumPhotos.push({
        albumId: album.id,
        photoId,
        position: index,
      })
    })
  }

  if (seedSettings?.data) {
    db.settings = structuredClone(seedSettings.data)
  }
  db.settings.app = { ...(db.settings.app || {}) }
  db.settings.app.avatarUrl = '/brand/avatar.webp'
  db.settings.app.socialLinks = db.settings.app.socialLinks || '[]'
  db.settings.app['appearance.homeHeaderLayout'] = 'topbar'

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@memora.local'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Memora@2026'
  db.users = [
    {
      id: 1,
      email: adminEmail,
      username: process.env.ADMIN_USERNAME || 'LiuShen',
      passwordHash: bcrypt.hashSync(adminPassword, 10),
      avatar: '/brand/avatar.webp',
      isAdmin: true,
      createdAt: new Date().toISOString(),
      passwordChangedAt: null,
    },
  ]

  console.log(`[seed] imported ${db.photos.length} photos, ${db.albums.length} albums`)
  console.log(`[seed] admin account: ${adminEmail} / ${adminPassword}`)
  return db
}

export function listPhotos({ includeHidden = false } = {}) {
  const db = getDb()
  return db.photos
    .filter((p) => includeHidden || !p.hidden)
    .slice()
    .sort((a, b) => {
      const da = new Date(a.dateTaken || a.lastModified || 0).getTime()
      const dbb = new Date(b.dateTaken || b.lastModified || 0).getTime()
      return dbb - da
    })
}

export function findPhoto(id) {
  return getDb().photos.find((p) => p.id === id) || null
}

export function listAlbums() {
  const db = getDb()
  return db.albums
    .slice()
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((album) => {
      const photoIds = db.albumPhotos
        .filter((ap) => ap.albumId === album.id)
        .sort((a, b) => a.position - b.position)
        .map((ap) => ap.photoId)
      return { ...album, photoIds }
    })
}

export function findAlbum(id) {
  return listAlbums().find((a) => a.id === Number(id)) || null
}

export function newPhotoId(filename) {
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const suffix = crypto.randomBytes(3).toString('hex')
  return `${base || 'photo'}-${Date.now().toString(36)}-${suffix}`
}

export function randomId(length = 16) {
  return crypto.randomBytes(length).toString('hex')
}

export function addPhoto(photo) {
  const db = getDb()
  db.photos.unshift(photo)
  saveDb()
  return photo
}

export function updatePhoto(id, patch) {
  const db = getDb()
  const index = db.photos.findIndex((p) => p.id === id)
  if (index === -1) return null
  db.photos[index] = { ...db.photos[index], ...patch }
  saveDb()
  return db.photos[index]
}

export function moveToTrash(id) {
  const db = getDb()
  const index = db.photos.findIndex((p) => p.id === id)
  if (index === -1) return null
  const [photo] = db.photos.splice(index, 1)
  db.trash.unshift({ ...photo, deletedAt: new Date().toISOString() })
  db.albumPhotos = db.albumPhotos.filter((ap) => ap.photoId !== id)
  for (const album of db.albums) {
    if (album.coverPhotoId === id) {
      const next = db.albumPhotos.find((ap) => ap.albumId === album.id)
      album.coverPhotoId = next ? next.photoId : null
    }
  }
  saveDb()
  return photo
}

export function restorePhoto(id) {
  const db = getDb()
  const index = db.trash.findIndex((p) => p.id === id)
  if (index === -1) return null
  const [photo] = db.trash.splice(index, 1)
  delete photo.deletedAt
  db.photos.unshift(photo)
  saveDb()
  return photo
}

export function purgePhoto(id) {
  const db = getDb()
  const index = db.trash.findIndex((p) => p.id === id)
  if (index === -1) return null
  const [photo] = db.trash.splice(index, 1)
  saveDb()
  return photo
}

export function getSettings() {
  return getDb().settings
}

export function publicSettings() {
  const settings = getSettings()
  return {
    analytics: settings.analytics || {},
    app: settings.app || {},
    location: settings.location || {},
    map: settings.map || {},
    privacy: settings.privacy || {},
    system: settings.system || {},
  }
}

export function saveSettings(payload) {
  const db = getDb()
  for (const [namespace, values] of Object.entries(payload || {})) {
    if (!values || typeof values !== 'object') continue
    db.settings[namespace] = { ...(db.settings[namespace] || {}), ...values }
  }
  saveDb()
  return publicSettings()
}

export function stats() {
  const db = getDb()
  const storageBytes = db.photos.reduce((sum, p) => sum + (Number(p.fileSize) || 0), 0)
  return {
    photos: db.photos.length,
    albums: db.albums.length,
    hidden: db.photos.filter((p) => p.hidden).length,
    trash: db.trash.length,
    tags: [...new Set(db.photos.flatMap((p) => p.tags || []))],
    storageBytes,
  }
}
