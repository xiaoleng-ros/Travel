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

// ---------------------------------------------------------------------------
// 管理员初始化
//
// 原则：密码以数据库为准。
// - 库里已有管理员：绝不用环境变量覆盖（后台改过的邮箱/密码不能被重启冲掉）。
// - 仅当库里没有管理员时才创建：
//   · 配置了 ADMIN_PASSWORD 就用它（首次部署引导）；
//   · 没配置就生成随机强密码，hash 后入库，并**只在本次控制台打印一次**，
//     提示登录后立即修改。密码不会写进任何文件、日志或文档。
// - 生产环境不允许出现"随机密码没人知道"的死锁：新建管理员必须显式设置
//   ADMIN_PASSWORD；库内已有管理员时不要求该变量。
// ---------------------------------------------------------------------------

// 生成一次性初始密码：24 位十六进制，足够强且便于手动输入。
export function randomInitialPassword() {
  return crypto.randomBytes(12).toString('hex')
}

// 返回 { changed, generated }：changed 表示是否新建了管理员，
// generated 表示密码是随机生成的（供调用方决定是否打印一次性提示）。
export function ensureAdmin(db) {
  // 以数据库为准：只要库里已有账号，就不碰它。
  if (db.users.length) return { changed: false, generated: false }

  const email = process.env.ADMIN_EMAIL?.trim() || 'admin@memora.local'
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin'
  const configured = process.env.ADMIN_PASSWORD
  const generated = !configured
  const password = configured || randomInitialPassword()

  if (generated && process.env.NODE_ENV === 'production') {
    throw new Error('[admin] 生产环境首次部署必须设置 ADMIN_PASSWORD（库内已有管理员则无需设置）')
  }

  db.users.push({
    id: 1,
    email,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    avatar: '',
    isAdmin: true,
    createdAt: new Date().toISOString(),
    passwordChangedAt: null,
  })

  return { changed: true, generated, email, password }
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
  const admin = ensureAdmin(db)
  if (admin.changed) await flushDb(db)

  cache = db
  bindDb(db)
  console.log(`[store] driver=${driver} photos=${db.photos.length} albums=${db.albums.length}`)
  if (admin.generated) {
    console.warn('[admin] 已创建管理员（随机初始密码，仅显示这一次）:')
    console.warn(`[admin]   email:     ${admin.email}`)
    console.warn(`[admin]   password:  ${admin.password}`)
    console.warn('[admin] 请登录后立即在「账户」页修改密码。该密码不会再次显示，也未写入任何文件。')
  }
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

  // 管理员账号统一由 initStore() 里的 ensureAdmin() 创建：
  // 密码以数据库为准，代码里不再保留任何硬编码口令。
  db.users = []

  console.log(`[seed] imported ${db.photos.length} photos, ${db.albums.length} albums`)
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
