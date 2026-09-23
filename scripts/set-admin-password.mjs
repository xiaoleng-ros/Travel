/**
 * 直接重设管理员密码（应急运维脚本）。
 *
 * 用途：忘记密码、或需要在无法登录的情况下换密码。
 * 之所以能绕过登录，是因为它直接写数据库 —— 它需要 `.env.local` 里的 Turso 凭据，
 * 因此执行权限本就等价于数据库写权限，不额外扩大攻击面。
 *
 * 写入格式与业务代码保持一致：`bcrypt(clientHash(明文))`，
 * 其中 clientHash = sha256('photo-memoir::v1::' + 明文)，盐值必须与
 * `src/utils/password.js` 和 `cloud-functions/api/[[default]].js` 完全一致。
 *
 * 用法：
 *   node scripts/set-admin-password.mjs <新密码>            # 预演
 *   node scripts/set-admin-password.mjs <新密码> --apply    # 真正写入
 *
 * 副作用：会刷新 password_changed_at ⇒ 此前签发的所有登录态（含其他设备）立即失效。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const SALT = 'photo-memoir::v1::'
const clientHash = (p) => crypto.createHash('sha256').update(SALT + p).digest('hex')

const MIN = 6
const MAX = 20
const CLASS_RES = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^a-zA-Z0-9]/]

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const newPassword = args.find((a) => !a.startsWith('--'))
const username = args.find((a) => a.startsWith('--user='))?.slice(7) || 'admin'

if (!newPassword) {
  console.error('用法: node scripts/set-admin-password.mjs <新密码> [--apply] [--user=admin]')
  process.exit(1)
}

// 与前后端同一套规则：6-20 位，四类字符任选其二
if (newPassword.length < MIN || newPassword.length > MAX) {
  console.error(`密码长度需为 ${MIN}-${MAX} 位`)
  process.exit(1)
}
if (CLASS_RES.filter((re) => re.test(newPassword)).length < 2) {
  console.error('密码需包含大写字母、小写字母、数字、特殊字符中的至少两类')
  process.exit(1)
}

const envPath = path.resolve('.env.local')
if (!fs.existsSync(envPath)) {
  console.error('找不到 .env.local，无法取得数据库连接串')
  process.exit(1)
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].trim()
}

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
console.log('目标库:', env.TURSO_DATABASE_URL)
console.log('账号  :', username)
console.log('模式  :', APPLY ? '⚠️  APPLY（会写入）' : '预演（不写入）')

const cred = bcrypt.hashSync(clientHash(newPassword), 10)
const changedAt = Math.floor(Date.now() / 1000)

if (!APPLY) {
  const { rows } = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  console.log(rows.length ? '→ 找到账号，可执行（加 --apply 写入）' : '→ ⚠️ 账号不存在')
  db.close()
  process.exit(0)
}

const res = await db.execute({
  sql: 'UPDATE users SET password = ?, password_changed_at = ? WHERE username = ?',
  args: [cred, changedAt, username],
})
console.log('影响行数:', res.rowsAffected)

const { rows } = await db.execute({
  sql: 'SELECT password, password_changed_at FROM users WHERE username = ?',
  args: [username],
})
const ok = rows[0] && bcrypt.compareSync(clientHash(newPassword), rows[0].password)
console.log('回读校验:', ok ? '通过 ✓' : '失败 ✗')
console.log('password_changed_at:', rows[0]?.password_changed_at, '（旧登录态已全部失效，需重新登录）')
db.close()
