// 验证「删除头像 = 置空」而不是回退到默认图。
//
// 注意：DELETE 会把七牛/本地上的对象真的删掉，所以删完再写回原来的 URL，
// 只会在库里留下一个指向已删除对象的悬空地址（页面会 404 → 空白）。
// 因此这个探针**不还原 URL**，跑完头像保持为空；需要头像就重新上传一张。
const BASE = process.env.API_BASE || 'http://127.0.0.1:3001'

const login = await fetch(`${BASE}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@memora.local', password: process.env.ADMIN_PASSWORD }),
})
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')

const before = await (await fetch(`${BASE}/api/profile`, { headers: { cookie } })).json()
const original = before.avatar
console.log('原头像 =', JSON.stringify(original))

const del = await fetch(`${BASE}/api/profile/avatar`, { method: 'DELETE', headers: { cookie } })
const delJson = await del.json()
console.log('DELETE', del.status, 'avatar =', JSON.stringify(delJson?.user?.avatar))

const after = await (await fetch(`${BASE}/api/profile`, { headers: { cookie } })).json()
console.log('GET profile avatar =', JSON.stringify(after.avatar))

const settingsAfter = await (await fetch(`${BASE}/api/system/settings/all`)).json()
console.log('settings.app.avatarUrl =', JSON.stringify(settingsAfter?.data?.app?.avatarUrl))

const emptyOk = after.avatar === '' && settingsAfter?.data?.app?.avatarUrl === ''
console.log(emptyOk ? 'OK  删除后 avatar 与 settings 都是空串' : 'FAIL 删除后仍有值')
if (original) {
  console.log('提示：原对象已被删除，这里不再写回 URL（否则会留下悬空地址）。需要头像请重新上传。')
}
process.exit(emptyOk ? 0 : 1)
