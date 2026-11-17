import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { ensureAdmin, randomInitialPassword } from '../server/store.js'

// 保存并恢复环境变量，避免测试间互相污染
const KEYS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_USERNAME', 'NODE_ENV']
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
function resetEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
}

test('randomInitialPassword 生成 24 位十六进制强密码', () => {
  const a = randomInitialPassword()
  const b = randomInitialPassword()
  assert.match(a, /^[0-9a-f]{24}$/)
  assert.notEqual(a, b)
})

test('ensureAdmin：库里已有管理员时完全以数据库为准，不覆盖', () => {
  resetEnv()
  process.env.ADMIN_EMAIL = 'env@example.com'
  process.env.ADMIN_PASSWORD = 'env-password'
  const existing = {
    id: 1,
    email: 'in-db@example.com',
    username: 'kept',
    passwordHash: bcrypt.hashSync('db-password', 4),
    isAdmin: true,
  }
  const db = { users: [existing] }
  const result = ensureAdmin(db)
  assert.equal(result.changed, false)
  assert.equal(result.generated, false)
  assert.equal(db.users.length, 1)
  assert.equal(db.users[0], existing)
  assert.equal(db.users[0].email, 'in-db@example.com')
  assert.equal(db.users[0].passwordHash, existing.passwordHash)
})

test('ensureAdmin：空库且配置了 ADMIN_PASSWORD 时用该密码创建管理员', () => {
  resetEnv()
  process.env.ADMIN_EMAIL = 'boss@example.com'
  process.env.ADMIN_USERNAME = 'boss'
  process.env.ADMIN_PASSWORD = 'chosen-password'
  delete process.env.NODE_ENV
  const db = { users: [] }
  const result = ensureAdmin(db)
  assert.equal(result.changed, true)
  assert.equal(result.generated, false)
  assert.equal(result.email, 'boss@example.com')
  assert.equal(db.users.length, 1)
  assert.equal(db.users[0].email, 'boss@example.com')
  assert.equal(db.users[0].username, 'boss')
  assert.equal(db.users[0].isAdmin, true)
  assert.equal(bcrypt.compareSync('chosen-password', db.users[0].passwordHash), true)
})

test('ensureAdmin：空库且未配置密码时生成随机密码并标记为 generated', () => {
  resetEnv()
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD
  delete process.env.NODE_ENV
  const db = { users: [] }
  const result = ensureAdmin(db)
  assert.equal(result.changed, true)
  assert.equal(result.generated, true)
  assert.match(result.password, /^[0-9a-f]{24}$/)
  assert.equal(bcrypt.compareSync(result.password, db.users[0].passwordHash), true)
})

test('ensureAdmin：生产环境空库且未配置密码时直接拒绝启动', () => {
  resetEnv()
  process.env.NODE_ENV = 'production'
  delete process.env.ADMIN_PASSWORD
  const db = { users: [] }
  assert.throws(() => ensureAdmin(db), /生产环境首次部署必须设置 ADMIN_PASSWORD/)
  assert.equal(db.users.length, 0)
})

// 恢复原始环境变量
test.after(() => resetEnv())
