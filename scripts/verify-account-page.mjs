/**
 * 账户页四件事的接口级验收：改用户名、改邮箱、改密码、删除头像（置空，不回退默认图）。
 * GET /api/profile 直接返回 userSummary（不包 user 字段）。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3001'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

let cookie = ''
async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) },
  })
  for (const c of res.headers.getSetCookie?.() || []) cookie = c.split(';')[0]
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 120) }
  return { status: res.status, body }
}
async function login(password) {
  cookie = ''
  return call('/api/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password }) })
}
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)

const first = await login(PASSWORD)
ok('登录', first.status === 200)
if (first.status !== 200) process.exit(1)

const before = (await call('/api/profile')).body
console.log('当前资料:', JSON.stringify(before))

const u = await call('/api/profile', { method: 'POST', body: JSON.stringify({ username: '小冷' }) })
ok('改用户名 -> 小冷', u.status === 200 && u.body.user.username === '小冷', u.body.user?.username)
const uBad = await call('/api/profile', { method: 'POST', body: JSON.stringify({ username: 'a' }) })
ok('用户名 1 字符被拒', uBad.status === 400, JSON.stringify(uBad.body))
const eBad = await call('/api/profile', { method: 'POST', body: JSON.stringify({ email: 'not-an-email' }) })
ok('非法邮箱被拒', eBad.status === 400, JSON.stringify(eBad.body))
const e = await call('/api/profile', { method: 'POST', body: JSON.stringify({ email: 'xiaoleng@memora.local' }) })
ok('改邮箱', e.status === 200 && e.body.user.email === 'xiaoleng@memora.local', e.body.user?.email)
const eBack = await call('/api/profile', { method: 'POST', body: JSON.stringify({ email: EMAIL }) })
ok('邮箱改回', eBack.status === 200 && eBack.body.user.email === EMAIL)

const pBad = await call('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: 'wrong-pass', newPassword: 'abcdef123' }) })
ok('当前密码错误被拒', pBad.status === 400, JSON.stringify(pBad.body))
const pShort = await call('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: '123' }) })
ok('新密码太短被拒', pShort.status === 400, JSON.stringify(pShort.body))
const next = PASSWORD + '.x1'
const pOk = await call('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: PASSWORD, newPassword: next }) })
ok('改密码成功', pOk.status === 200, JSON.stringify(pOk.body))

const newLogin = await login(next)
ok('新密码可登录', newLogin.status === 200)
const oldLogin = await login(PASSWORD)
ok('旧密码已失效', oldLogin.status === 401 || oldLogin.status === 400, String(oldLogin.status))

// 用新密码登录后立刻改回旧密码
const again = await login(next)
ok('新密码再次登录', again.status === 200)
const revert = await call('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: next, newPassword: PASSWORD }) })
ok('密码改回原值', revert.status === 200)

const del = await call('/api/profile/avatar', { method: 'DELETE' })
ok('删除头像后置空（不回退默认图）', del.status === 200 && del.body.user.avatar === '', JSON.stringify(del.body.user?.avatar))
const back = await call('/api/profile', { method: 'POST', body: JSON.stringify({ username: 'admin' }) })
ok('用户名改回 admin', back.status === 200 && back.body.user.username === 'admin')

const final = (await call('/api/profile')).body
console.log('最终资料:', JSON.stringify(final))
const settings = await call('/api/system/settings/all')
console.log('settings.app.avatarUrl:', settings.body?.data?.app?.avatarUrl)
