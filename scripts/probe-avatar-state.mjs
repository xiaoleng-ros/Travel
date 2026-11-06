// 只读探针：看当前 admin 的头像状态（不修改任何数据）
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001'

const login = await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@memora.local', password: process.env.ADMIN_PASSWORD }),
})
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const profile = await login.json().catch(() => null)
console.log('login', login.status, JSON.stringify(profile?.user || profile))

const me = await fetch(`${BASE}/api/profile`, { headers: { cookie } })
const meJson = await me.json()
console.log('profile', me.status, JSON.stringify(meJson))

const settings = await fetch(`${BASE}/api/system/settings/all`)
const sj = await settings.json()
console.log('settings.app.avatarUrl =', JSON.stringify(sj?.data?.app?.avatarUrl))
