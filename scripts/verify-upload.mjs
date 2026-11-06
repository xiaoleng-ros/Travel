// 验证上传链路（本地模式）：POST /api/admin/upload → 检查文件与 db
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3001'

async function main() {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@memora.local', password: '123456789' }),
  })
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  console.log('login:', login.status)

  const mode = await (await fetch(`${BASE}/api/admin/upload/mode`, { headers: { Cookie: cookie } })).json()
  console.log('mode:', JSON.stringify(mode))

  const buf = fs.readFileSync('.tmp-test.jpg')
  const form = new FormData()
  form.append('files', new Blob([buf], { type: 'image/jpeg' }), '测试照片.jpg')

  const up = await fetch(`${BASE}/api/admin/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  const text = await up.text()
  console.log('upload:', up.status, text.slice(0, 300))

  if (up.ok) {
    const data = JSON.parse(text)
    const photo = data.photos?.[0]
    if (photo) {
      console.log('photo:', photo.id, JSON.stringify(photo.title), photo.originalUrl, photo.thumbnailUrl)
      const check = async (url) => {
        const r = await fetch(`${BASE}${url}`)
        console.log('  GET', url, r.status, r.headers.get('content-type'), r.headers.get('content-length'))
      }
      await check(photo.originalUrl)
      await check(photo.thumbnailUrl)

      // 清理：删除照片
      const del = await fetch(`${BASE}/api/admin/photos/${photo.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      })
      console.log('delete:', del.status)
      const purge = await fetch(`${BASE}/api/admin/photos/${photo.id}/purge`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      })
      console.log('purge:', purge.status)
      const after = await fetch(`${BASE}${photo.originalUrl}`)
      console.log('after purge originalUrl:', after.status)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
