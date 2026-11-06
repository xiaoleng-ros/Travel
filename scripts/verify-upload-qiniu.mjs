// 验证七牛模式的完整上传链路：token → 浏览器直传 → complete 落库 → 读图 → 删除
import fs from 'node:fs'
import https from 'node:https'
import sharp from 'sharp'

const BASE = 'http://127.0.0.1:3001'

function putMultipart(url, { token, key, buffer, filename, mimeType, tries = 8 }) {
  return new Promise((resolve, reject) => {
    const boundary = '----memora' + Date.now()
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${token}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]
    const body = Buffer.concat(parts)
    let attempt = 0
    const go = () => {
      attempt++
      const req = https.request(
        `${url}/`,
        {
          method: 'POST',
          timeout: 90000,
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () =>
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
          )
        },
      )
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => (attempt < tries ? setTimeout(go, 1500) : reject(e)))
      req.write(body)
      req.end()
    }
    go()
  })
}

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
  if (mode.provider !== 'qiniu') {
    console.log('当前不是七牛模式，跳过')
    return
  }

  // 造一张带 EXIF 的真实尺寸图（1600x1200）
  const buffer = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 30, g: 140, b: 210 } },
  })
    .jpeg({ quality: 88 })
    .withMetadata({ exif: { IFD0: { Make: 'MemoraTest', Model: 'QiniuE2E' } } })
    .toBuffer()
  const filename = '七牛端到端测试.jpg'
  console.log('测试图:', buffer.length, 'bytes')

  const tokenRes = await fetch(`${BASE}/api/admin/upload/token`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, mimeType: 'image/jpeg', size: buffer.length }),
  })
  const target = await tokenRes.json()
  console.log('token:', tokenRes.status, JSON.stringify({ key: target.key, uploadUrl: target.uploadUrl }))
  if (!tokenRes.ok) throw new Error('取 token 失败: ' + JSON.stringify(target))

  const up = await putMultipart(target.uploadUrl, {
    token: target.token,
    key: target.key,
    buffer,
    filename: encodeURIComponent(filename),
    mimeType: 'image/jpeg',
  })
  console.log('直传七牛:', up.status, up.body.slice(0, 120))
  if (up.status !== 200) throw new Error('直传失败')

  const done = await fetch(`${BASE}/api/admin/upload/complete`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: target.id, key: target.key, filename, albumId: null }),
  })
  const doneText = await done.text()
  console.log('complete:', done.status, doneText.slice(0, 400))
  if (!done.ok) throw new Error('complete 失败')

  const photo = JSON.parse(doneText).photos[0]
  console.log('\n落库结果:')
  console.log('  id          ', photo.id)
  console.log('  title       ', JSON.stringify(photo.title))
  console.log('  size        ', photo.width + 'x' + photo.height)
  console.log('  originalUrl ', photo.originalUrl)
  console.log('  thumbnailUrl', photo.thumbnailUrl)
  console.log('  fileSize    ', photo.fileSize)

  const httpsGet = (url, tries = 8) =>
    new Promise((resolve, reject) => {
      let attempt = 0
      const go = () => {
        attempt++
        const req = https.request(url, { method: 'GET', timeout: 60000 }, (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
          )
        })
        req.on('timeout', () => req.destroy(new Error('timeout')))
        req.on('error', (e) => (attempt < tries ? setTimeout(go, 1500) : reject(e)))
        req.end()
      }
      go()
    })

  const check = async (label, url) => {
    const r = await httpsGet(url)
    let dim = ''
    if ((r.headers['content-type'] || '').startsWith('image/')) {
      try {
        const m = await sharp(r.body).metadata()
        dim = `${m.width}x${m.height} ${m.format}`
      } catch {}
    }
    console.log(
      `  ${label.padEnd(12)} ${r.status} ${(r.headers['content-type'] || '-').padEnd(12)} ${r.body.length}B ${dim}`,
    )
    return { status: r.status, len: r.body.length, dim }
  }
  const o = await check('原图', photo.originalUrl)
  const t = await check('缩略图', photo.thumbnailUrl)

  const dimOk = photo.width === 1600 && photo.height === 1200
  const thumbOk = t.status === 200 && t.dim.includes('640x480')
  const distinct = o.len !== t.len

  // 清理
  await fetch(`${BASE}/api/admin/photos/${photo.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
  const purge = await fetch(`${BASE}/api/admin/photos/${photo.id}/purge`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  console.log('purge:', purge.status)
  let after
  try {
    after = await httpsGet(photo.originalUrl, 3)
  } catch {
    after = { status: 0 }
  }
  console.log('purge 后原图:', after.status)

  console.log(
    `\n===== ${dimOk && thumbOk && distinct && after.status === 404 ? '全部通过' : '有失败项'} =====`,
  )
  console.log(`  宽高 1600x1200: ${dimOk ? 'OK' : 'FAIL ' + photo.width + 'x' + photo.height}`)
  console.log(`  缩略图 640x480: ${thumbOk ? 'OK' : 'FAIL'}`)
  console.log(`  两者不同对象  : ${distinct ? 'OK' : 'FAIL'}`)
  console.log(`  删除后原图 404: ${after.status === 404 ? 'OK' : 'FAIL ' + after.status}`)
}

main().catch((e) => {
  console.error('FAILED', e.message)
  process.exit(1)
})
