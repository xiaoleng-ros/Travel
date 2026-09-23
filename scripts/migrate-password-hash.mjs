/**
 * 一次性迁移：把 users.password 从 bcrypt(明文) 升级为 bcrypt(clientHash(明文))。
 *
 * 为什么必须做：
 *   前端改为发送「客户端哈希」之后，服务端再也拿不到明文；
 *   而哈希不可逆，所以无法用 clientHash(明文) 去匹配旧格式的 bcrypt(明文) 记录。
 *   ⇒ 不迁移的话，现有密码会直接登不进去。
 *
 * 迁移后**用户的密码本身没有变化**，只是数据库里的存储格式换了，
 * 校验路径从「bcrypt(明文)」变成了「bcrypt(sha256(salt + 明文))」。
 *
 * 用法：
 *   node scripts/migrate-password-hash.mjs            # 预演：只报告，不写入
 *   node scripts/migrate-password-hash.mjs --apply    # 真正写入
 *
 * 明文来源：.env.local 的 ADMIN_INITIAL_PASSWORD
 *   —— 仅在该账号**从未改过密码**（password_changed_at 为 null）时才是当前密码。
 *      改过密码的记录脚本无法推断明文，会跳过并告警，需要人工处理。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const APPLY = process.argv.includes('--apply')

/** 必须与 src/utils/password.js 的 SALT、后端 PASSWORD_CLIENT_SALT 完全一致 */
const SALT = 'photo-memoir::v1::'
const clientHash = (plain) => crypto.createHash('sha256').update(SALT + plain).digest('hex')

// ---- 读取 .env.local ----
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const envPath = path.join(root, '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('找不到 .env.local，无法取得数据库连接串')
  process.exit(1)
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}

const candidate = env.ADMIN_INITIAL_PASSWORD
if (!candidate) {
  console.error('.env.local 里没有 ADMIN_INITIAL_PASSWORD，无法推断明文密码。')
  console.error('如果密码是在后台改过的，请人工处理：直接构造 bcrypt(clientHash(明文)) 写入。')
  process.exit(1)
}

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
console.log('目标库:', env.TURSO_DATABASE_URL)
console.log('模式  :', APPLY ? '⚠️  APPLY（会写入）' : '预演（不写入）')
console.log()

const { rows } = await db.execute('SELECT id, username, password, password_changed_at FROM users')

let migrated = 0
let skipped = 0

for (const u of rows) {
  console.log(`#${u.id} ${u.username}`)
  console.log('  当前哈希前缀:', String(u.password).slice(0, 12), '| 长度', String(u.password).length)
  console.log('  password_changed_at:', u.password_changed_at)

  // 已经是新格式？用 clientHash(明文) 直接比对即可判断（可能重复迁移的幂等保护）
  const newHash = bcrypt.hashSync(clientHash(candidate), 10)
  if (bcrypt.compareSync(clientHash(candidate), u.password)) {
    console.log('  → 已经是新格式，跳过')
    skipped++
    continue
  }

  if (u.password_changed_at) {
    console.log('  → ⚠️ 该账号改过密码，脚本无法推断明文，跳过（需人工处理）')
    skipped++
    continue
  }

  if (!bcrypt.compareSync(candidate, u.password)) {
    console.log('  → ⚠️ ADMIN_INITIAL_PASSWORD 与该哈希不匹配，跳过（密码可能已变动）')
    skipped++
    continue
  }

  console.log('  → ✅ 匹配成功，可迁移为 bcrypt(clientHash(明文))')
  if (APPLY) {
    await db.execute({
      sql: 'UPDATE users SET password = ? WHERE id = ?',
      args: [newHash, u.id],
    })
    // 回读确认
    const check = await db.execute({ sql: 'SELECT password FROM users WHERE id = ?', args: [u.id] })
    const ok = bcrypt.compareSync(clientHash(candidate), check.rows[0].password)
    console.log('  → 回读校验:', ok ? '通过 ✓' : '失败 ✗')
    migrated++
  }
}

console.log()
console.log(`结果：可迁移/已迁移 ${migrated} 条，跳过 ${skipped} 条`)
if (!APPLY) {
  console.log('（预演模式，未写入任何数据。确认无误后加 --apply 执行）')
}
