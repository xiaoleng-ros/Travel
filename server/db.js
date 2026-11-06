// ---------------------------------------------------------------------------
// 持久层：Turso (libSQL) / 本地 db.json 双模式
//
// 设计要点
// - 整个应用是「内存全量 + 同步读」的模型（getDb() 返回缓存对象），这一层保持不变，
//   避免把 15 处 getDb() 调用点全部改成 async。
// - 写回改成**按行增量**：每次 flush 只把变化的记录 upsert / delete 到 Turso，
//   不再是 db.json 时代那种整个文件 JSON.stringify 覆写。
// - 没有配置 TURSO_DATABASE_URL 时自动退回 db.json，本地开发零配置。
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
export const DB_FILE = path.join(ROOT, 'data', 'db.json')

export const EMPTY_DB = {
  users: [],
  photos: [],
  albums: [],
  albumPhotos: [],
  settings: {},
  reactions: [],
  trash: [],
  createdAt: new Date().toISOString(),
}

// settings 是 namespace -> object 的映射，其余都是数组
const ARRAY_COLLECTIONS = ['users', 'photos', 'albums', 'albumPhotos', 'reactions', 'trash']

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
     collection TEXT NOT NULL,
     id TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0,
     data TEXT NOT NULL,
     PRIMARY KEY (collection, id)
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     namespace TEXT PRIMARY KEY,
     data TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
]

let client = null
let mode = 'json'
let lastError = null

// 已写入远端的快照：collection -> Map<id, json 字符串>
const persisted = new Map()
const persistedSettings = new Map()
let persistedCreatedAt = null

export function getDriver() {
  return mode
}

export function getLastError() {
  return lastError
}

export function keyOf(collection, item) {
  if (collection === 'albumPhotos') return `${item.albumId}:${item.photoId}`
  if (collection === 'reactions') return `${item.photoId}:${item.fingerprint}`
  return String(item.id)
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------
export async function initDb({ url, token } = {}) {
  const databaseUrl = (url || process.env.TURSO_DATABASE_URL || '').trim()
  const authToken = (token || process.env.TURSO_AUTH_TOKEN || '').trim()

  if (!databaseUrl) {
    mode = 'json'
    console.log('[db] TURSO_DATABASE_URL 未配置，使用本地 data/db.json')
    return mode
  }

  try {
    const { createClient } = await import('@libsql/client')
    client = createClient({ url: databaseUrl, authToken: authToken || undefined })
    for (const statement of SCHEMA) await client.execute(statement)
    mode = 'turso'
    console.log(`[db] 已连接 Turso: ${databaseUrl}`)
  } catch (err) {
    lastError = err
    mode = 'json'
    client = null
    console.error('[db] Turso 连接失败，退回 db.json:', err.message)
  }
  return mode
}

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------
export async function loadDb() {
  if (mode !== 'turso' || !client) return loadFromJson()

  const db = structuredClone(EMPTY_DB)
  db.users = []
  db.photos = []
  db.albums = []
  db.albumPhotos = []
  db.reactions = []
  db.trash = []

  const result = await client.execute(
    'SELECT collection, id, position, data FROM records ORDER BY collection, position',
  )
  for (const row of result.rows) {
    const collection = String(row.collection)
    if (!ARRAY_COLLECTIONS.includes(collection)) continue
    let item
    try {
      item = JSON.parse(String(row.data))
    } catch {
      continue
    }
    db[collection].push(item)
    let bucket = persisted.get(collection)
    if (!bucket) {
      bucket = new Map()
      persisted.set(collection, bucket)
    }
    bucket.set(String(row.id), String(row.data))
  }

  const settingsRows = await client.execute('SELECT namespace, data FROM settings')
  for (const row of settingsRows.rows) {
    const namespace = String(row.namespace)
    try {
      db.settings[namespace] = JSON.parse(String(row.data))
      persistedSettings.set(namespace, String(row.data))
    } catch {}
  }

  const metaRows = await client.execute('SELECT key, value FROM meta')
  for (const row of metaRows.rows) {
    if (String(row.key) === 'createdAt') persistedCreatedAt = String(row.value)
  }
  db.createdAt = persistedCreatedAt || new Date().toISOString()

  // 空库且本地有 db.json：自动把本地数据导入一次，省掉手工迁移
  if (!db.photos.length && !db.users.length && fs.existsSync(DB_FILE)) {
    console.log('[db] Turso 为空，正在从 data/db.json 导入初始数据…')
    const local = loadFromJson()
    Object.assign(db, local)
    persisted.clear()
    persistedSettings.clear()
    await flushDb(db)
    console.log(`[db] 导入完成：${db.photos.length} 张照片 / ${db.albums.length} 个相册`)
  }

  return db
}

function loadFromJson() {
  if (fs.existsSync(DB_FILE)) {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    persisted.clear()
    persistedSettings.clear()
    for (const collection of ARRAY_COLLECTIONS) {
      const bucket = new Map()
      for (const item of db[collection] || []) bucket.set(keyOf(collection, item), JSON.stringify(item))
      persisted.set(collection, bucket)
    }
    for (const [namespace, values] of Object.entries(db.settings || {})) {
      persistedSettings.set(namespace, JSON.stringify(values))
    }
    persistedCreatedAt = db.createdAt || null
    return db
  }
  return structuredClone(EMPTY_DB)
}

// ---------------------------------------------------------------------------
// 写入：按行差分
// ---------------------------------------------------------------------------
function buildStatements(db) {
  const statements = []

  for (const collection of ARRAY_COLLECTIONS) {
    const bucket = persisted.get(collection) || new Map()
    const seen = new Set()
    const items = db[collection] || []
    items.forEach((item, index) => {
      const id = keyOf(collection, item)
      seen.add(id)
      const json = JSON.stringify(item)
      if (bucket.get(id) === json) return
      statements.push({
        sql: `INSERT INTO records (collection, id, position, data) VALUES (?, ?, ?, ?)
              ON CONFLICT(collection, id) DO UPDATE SET position = excluded.position, data = excluded.data`,
        args: [collection, id, index, json],
      })
      bucket.set(id, json)
    })
    for (const id of [...bucket.keys()]) {
      if (seen.has(id)) continue
      statements.push({
        sql: 'DELETE FROM records WHERE collection = ? AND id = ?',
        args: [collection, id],
      })
      bucket.delete(id)
    }
    persisted.set(collection, bucket)
  }

  for (const [namespace, values] of Object.entries(db.settings || {})) {
    const json = JSON.stringify(values)
    if (persistedSettings.get(namespace) === json) continue
    statements.push({
      sql: `INSERT INTO settings (namespace, data) VALUES (?, ?)
            ON CONFLICT(namespace) DO UPDATE SET data = excluded.data`,
      args: [namespace, json],
    })
    persistedSettings.set(namespace, json)
  }

  const createdAt = db.createdAt || new Date().toISOString()
  if (persistedCreatedAt !== createdAt) {
    statements.push({
      sql: `INSERT INTO meta (key, value) VALUES ('createdAt', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [createdAt],
    })
    persistedCreatedAt = createdAt
  }

  return statements
}

function writeJson(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

let flushChain = Promise.resolve()

export function flushDb(db) {
  const snapshot = db || currentDb
  if (!snapshot) return Promise.resolve()
  if (mode !== 'turso' || !client) {
    try {
      writeJson(snapshot)
    } catch (err) {
      lastError = err
      console.error('[db] 写入 db.json 失败:', err.message)
    }
    return Promise.resolve()
  }

  // 串行化，避免两次 flush 并发产生交错语句
  flushChain = flushChain.then(async () => {
    const statements = buildStatements(snapshot)
    if (!statements.length) return
    try {
      await client.batch(statements, 'write')
    } catch (err) {
      lastError = err
      console.error('[db] 写入 Turso 失败:', err.message)
      // 回滚内存快照，下次 flush 会重试这些行
      for (const collection of ARRAY_COLLECTIONS) {
        persisted.delete(collection)
      }
      persistedSettings.clear()
    }
  })
  return flushChain
}

let currentDb = null
let timer = null

export function bindDb(db) {
  currentDb = db
}

export function scheduleSave(immediate = false) {
  if (!currentDb) return
  clearTimeout(timer)
  if (immediate) {
    flushDb(currentDb)
    return
  }
  timer = setTimeout(() => flushDb(currentDb), 80)
  if (typeof timer.unref === 'function') timer.unref()
}

// ---------------------------------------------------------------------------
// 迁移脚本用：把一整份 db 覆盖写入 Turso
// ---------------------------------------------------------------------------
export async function replaceAll(db) {
  if (mode !== 'turso' || !client) throw new Error('当前不是 Turso 模式')
  await client.execute('DELETE FROM records')
  await client.execute('DELETE FROM settings')
  await client.execute('DELETE FROM meta')
  persisted.clear()
  persistedSettings.clear()
  persistedCreatedAt = null
  await flushDb(db)
}
