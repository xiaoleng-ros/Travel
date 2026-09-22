/**
 * 一次性迁移脚本：把旧版自托管后端（server/data/db.json）的数据导入 libSQL / Turso。
 *
 * 用法（token 在 Turso 控制台或 `turso db tokens create <库名>` 获取）：
 *   TURSO_AUTH_TOKEN=<token> node scripts/migrate-to-turso.mjs
 * （token 也可写在 .env.local 里，脚本会自动读取）
 *
 * 迁移内容：
 *   - users    全量（含 bcrypt 密码哈希，管理员密码原样保留；保留原 id）
 *   - albums   全量（保留原 id，photos.album_id 引用不失效）
 *   - photos   全量（保留原 id 与软删除状态）
 *   - token_blacklist 仅未过期的条目
 *   - settings 不迁移：新架构的存储配置走环境变量，且旧配置是测试值
 *
 * 幂等：按 id / username 跳过已存在的记录，可重复执行。
 * 注意：storage_provider 非 kodo 的照片在 EdgeOne 版下无法正确生成展示 URL，
 * 迁移时会列出提醒（新版只支持七牛 Kodo）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client/web'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---- 极简 .env.local 加载（与 dev-server.mjs 一致，不覆盖已有环境变量）----
const envPath = path.join(root, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const DB_URL = process.env.TURSO_DATABASE_URL
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN
if (!DB_URL || !/^libsql:\/\//.test(DB_URL)) {
  console.error('缺少 TURSO_DATABASE_URL（libsql:// 连接串），请写入 .env.local 或环境变量')
  process.exit(1)
}
if (!AUTH_TOKEN) {
  console.error('缺少 TURSO_AUTH_TOKEN。获取方式：turso db tokens create <库名>，或 Turso 控制台该库的 Tokens 页')
  process.exit(1)
}

const legacyPath = path.join(root, 'server', 'data', 'db.json')
if (!fs.existsSync(legacyPath)) {
  console.error(`找不到旧库文件: ${legacyPath}`)
  process.exit(1)
}
const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))

const db = createClient({ url: DB_URL, authToken: AUTH_TOKEN })

// 与 cloud-functions/api/[[default]].js 的 SCHEMA 保持一致
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

async function exists(table, col, val) {
  const { rows } = await db.execute({ sql: `SELECT 1 FROM ${table} WHERE ${col} = ?`, args: [val] })
  return rows.length > 0
}

async function main() {
  await db.batch(SCHEMA)
  const summary = []

  // ---- users ----
  let users = 0
  for (const u of legacy.users || []) {
    if (await exists('users', 'username', u.username)) continue
    await db.execute({
      sql: 'INSERT INTO users (id, username, password, nickname, password_changed_at) VALUES (?, ?, ?, ?, ?)',
      args: [u.id, u.username, u.password, u.nickname || '', null],
    })
    users++
  }
  summary.push(`users: 导入 ${users} 条`)

  // ---- albums ----
  let albums = 0
  for (const a of legacy.albums || []) {
    if (await exists('albums', 'id', a.id)) continue
    await db.execute({
      sql: 'INSERT INTO albums (id, name, description, cover, create_time) VALUES (?, ?, ?, ?, ?)',
      args: [a.id, a.name, a.description || '', a.cover || '', a.create_time || new Date().toISOString()],
    })
    albums++
  }
  summary.push(`albums: 导入 ${albums} 条`)

  // ---- photos ----
  let photos = 0
  const nonKodo = []
  for (const p of legacy.photos || []) {
    if (await exists('photos', 'id', p.id)) continue
    if (p.storage_provider && p.storage_provider !== 'kodo') nonKodo.push(p)
    await db.execute({
      sql: `INSERT INTO photos (id, album_id, storage_key, storage_provider, width, height,
              title, name, description, taken_at, sort_order, deleted_at, create_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [p.id, p.album_id, p.storage_key, p.storage_provider || 'kodo', p.width ?? null,
        p.height ?? null, p.title ?? '', p.name ?? '', p.description ?? '',
        p.taken_at ?? null, p.sort_order ?? null, p.deleted_at ?? null,
        p.create_time || new Date().toISOString()],
    })
    photos++
  }
  summary.push(`photos: 导入 ${photos} 条`)

  // ---- token_blacklist（只迁未过期的）----
  let blacklist = 0
  const now = Math.floor(Date.now() / 1000)
  for (const t of legacy.tokenBlacklist || []) {
    if (!t.jti || (t.exp || 0) <= now) continue
    if (await exists('token_blacklist', 'jti', t.jti)) continue
    await db.execute({ sql: 'INSERT INTO token_blacklist (jti, exp) VALUES (?, ?)', args: [t.jti, t.exp] })
    blacklist++
  }
  summary.push(`token_blacklist: 导入 ${blacklist} 条（已跳过过期条目）`)

  console.log('迁移完成：')
  for (const s of summary) console.log('  ' + s)
  if (nonKodo.length) {
    console.warn(`警告：${nonKodo.length} 张照片的 storage_provider 不是 kodo，EdgeOne 版无法为其生成展示 URL：`)
    for (const p of nonKodo) console.warn(`  - id=${p.id} key=${p.storage_key} provider=${p.storage_provider}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('迁移失败:', err.message)
  process.exit(1)
})
