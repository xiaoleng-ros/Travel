// 端到端验证：登录 → 改标题（UTF-8）→ 读回 → 确认落盘
const BASE = 'http://127.0.0.1:3001'

async function main() {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@memora.local', password: '123456789' }),
  })
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  console.log('login:', login.status, cookie ? 'cookie ok' : 'NO COOKIE')

  const id = 'IMG_20260925_152316'
  const title = '古往今来·测试'
  const patch = await fetch(`${BASE}/api/admin/photos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title }),
  })
  console.log('patch:', patch.status, await patch.text())

  await new Promise((r) => setTimeout(r, 400))

  const read = await fetch(`${BASE}/api/photos/${id}`)
  const photo = await read.json()
  console.log('api title:', JSON.stringify(photo.title), 'match=', photo.title === title)

  const fs = await import('node:fs')
  const disk = JSON.parse(fs.readFileSync('data/db.json', 'utf8'))
  const onDisk = disk.photos.find((p) => p.id === id)
  console.log('disk title:', JSON.stringify(onDisk.title), 'match=', onDisk.title === title)

  // 复原
  await fetch(`${BASE}/api/admin/photos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: '古往今来' }),
  })
  console.log('restored')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
