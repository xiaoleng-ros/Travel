import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import {
  EMPTY_DB,
  bindDb,
  flushDb,
  getDriver,
  getLastError,
  initDb,
  loadDb,
  scheduleSave,
} from './db.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const SEED_DIR = path.join(ROOT, 'data', 'seed')

export const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')
export const UPLOAD_THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs')
export const SEED_THUMB_DIR = path.join(ROOT, 'public', 'seed-thumbs')

let cache = null

// 仅在首次播种（库内还没有管理员）时，用环境变量 ADMIN_EMAIL / ADMIN_PASSWORD
// 初始化默认管理员账号。正常启动时不再覆盖，否则你在后台「账户」页改过的邮箱、
// 密码会在每次重启后被环境变量里的旧值冲掉。
// 返回 true 表示发生了变更
function applyAdminEnv(db) {
  const email = process.env.ADMIN_EMAIL?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email && !password) return false
  const admin = db.users.find((u) => u.isAdmin) || db.users[0]
  // 已有管理员：尊重后台改过的值，不再用环境变量覆盖
  if (admin) return false
  // 没有管理员：用环境变量的初始值建一个
  const initEmail = email || 'admin@memora.local'
  const initPassword = password || 'Memora@2026'
  db.users.push({
    id: 1,
    email: initEmail,
    username: process.env.ADMIN_USERNAME?.trim() || 'admin',
    passwordHash: bcrypt.hashSync(initPassword, 10),
    avatar: '',
    isAdmin: true,
    createdAt: new Date().toISOString(),
    passwordChangedAt: null,
  })
  console.log(`[admin] seeded from env: ${initEmail}`)
  return true
}

// ---------------------------------------------------------------------------
// 启动：连接持久层 → 全量载入内存 → 空库则播种
// ---------------------------------------------------------------------------
export async function initStore() {
  const driver = await initDb()
  let db = await loadDb()

  if (!db.users.length) {
    db = seedDatabase(db)
    await flushDb(db)
  }
  if (applyAdminEnv(db)) await flushDb(db)

  cache = db
  bindDb(db)
  console.log(`[store] driver=${driver} photos=${db.photos.length} albums=${db.albums.length}`)
  return db
}

export function getDb() {
  if (!cache) throw new Error('数据层尚未初始化，请先 await initStore()')
  return cache
}

export function isReady() {
  return Boolean(cache)
}

export function saveDb(immediate = false) {
  scheduleSave(immediate)
}

export async function flushNow() {
  await flushDb(cache)
}

export { getDriver, getLastError }

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

function seedDatabase(base) {
  const db = base || structuredClone(EMPTY_DB)
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

  db.albumPhotos = []
  for (const album of seedAlbums) {
    ;(album.photoIds || []).forEach((photoId, index) => {
      db.albumPhotos.push({ albumId: album.id, photoId, position: index })
    })
  }

  if (seedSettings?.data) {
    db.settings = structuredClone(seedSettings.data)
  }
  db.settings.app = { ...(db.settings.app || {}) }
  db.settings.app.avatarUrl = ''
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
      avatar: '',
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
