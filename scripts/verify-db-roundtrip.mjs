// 验证「API 写入 → Turso 持久化」闭环：建一个临时相册，确认落库，再删掉
const BASE = 'http://127.0.0.1:3001'

async function login() {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@memora.local', password: '123456789' }),
  })
  if (r.status !== 200) throw new Error('登录失败 ' + r.status)
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

const cookie = await login()

const before = await (await fetch(`${BASE}/api/albums`)).json()
console.log('写入前相册数:', before.length)

const created = await fetch(`${BASE}/api/admin/albums`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ title: '__写入闭环测试', description: '临时' }),
})
const createdBody = await created.json()
console.log('创建:', created.status, 'id =', createdBody.album?.id)

// 等防抖 flush（80ms）落地
await new Promise((r) => setTimeout(r, 1200))

const { createClient } = await import('@libsql/client')
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
const row = await client.execute({
  sql: "SELECT id, json_extract(data,'$.title') AS title FROM records WHERE collection='albums' AND id=?",
  args: [String(createdBody.album.id)],
})
console.log('Turso 里查到:', row.rows.length ? row.rows[0].title : '（没有）')

const deleted = await fetch(`${BASE}/api/admin/albums/${createdBody.album.id}`, {
  method: 'DELETE',
  headers: { Cookie: cookie },
})
console.log('删除:', deleted.status)

await new Promise((r) => setTimeout(r, 1200))
const afterRow = await client.execute({
  sql: "SELECT COUNT(*) AS c FROM records WHERE collection='albums' AND id=?",
  args: [String(createdBody.album.id)],
})
console.log('删除后 Turso 里该行:', Number(afterRow.rows[0].c), '（应为 0）')

const after = await (await fetch(`${BASE}/api/albums`)).json()
console.log('写入后相册数:', after.length)
after.forEach((a) => console.log('  ', a.id, a.title, 'photos=' + (a.photoIds || []).length))

const total = await client.execute("SELECT COUNT(*) AS c FROM records WHERE collection='albums'")
console.log('Turso albums 总行数:', Number(total.rows[0].c))

client.close()
