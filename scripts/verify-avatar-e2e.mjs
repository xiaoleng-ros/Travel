/**
 * 头像全链路验收（七牛模式）：
 *   登录 → mode → token → 直传 → complete → profile/settings 一致 → CDN 可读 → 删除头像
 * 注意：CDN 校验必须在「删除头像」之前，因为删除会删掉刚上传的对象。
 *
 * 用法：node --env-file-if-exists=.env scripts/verify-avatar-e2e.mjs
 */
import https from 'node:https'
import sharp from 'sharp'

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001'
const email = process.env.ADMIN_EMAIL || 'admin@memora.local'
const password = process.env.ADMIN_PASSWORD || ''

const login = await fetch(BASE + '/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const cookie = login.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ')
console.log('0. 登录 ->', login.status)

async function j(url, opts = {}) {
  const res = await fetch(BASE + url, { ...opts, headers: { Cookie: cookie, ...(opts.headers || {}) } })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

function uploadOnce(uploadUrl, token, key, buffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----memora' + Date.now()
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${token}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.webp"\r\n` +
        `Content-Type: image/webp\r\n\r\n`,
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const payload = Buffer.concat([head, buffer, tail])
    const u = new URL(uploadUrl)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
        timeout: 60000,
      },
      (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => resolve({ status: res.statusCode, body: d }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// 本机到 upload-as0.qiniup.com 偶发握手超时，重试几次
async function uploadWithRetry(uploadUrl, token, key, buffer, tries = 4) {
  let lastErr
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await uploadOnce(uploadUrl, token, key, buffer)
      if (r.status === 200) return r
      lastErr = new Error(`HTTP ${r.status} ${r.body.slice(0, 80)}`)
    } catch (e) {
      lastErr = e
    }
    console.log(`   直传第 ${i} 次失败：${lastErr.message}，重试…`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw lastErr
}

const buf = await sharp({
  create: { width: 512, height: 512, channels: 3, background: { r: 40, g: 120, b: 200 } },
})
  .webp()
  .toBuffer()

const mode = await j('/api/profile/avatar/mode')
console.log('1. mode ->', mode.status, JSON.stringify(mode.body))

if (mode.body?.provider !== 'qiniu') {
  console.log('   当前不是七牛模式，改用本地 multipart 分支')
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'image/webp' }), 'avatar.webp')
  const up = await j('/api/profile/avatar', { method: 'POST', body: fd })
  console.log('2. 本地上传 ->', up.status, up.body.user?.avatar)
  process.exit(0)
}

const tk = await j('/api/profile/avatar/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mimeType: 'image/webp', size: buf.length }),
})
console.log('2. token ->', tk.status, tk.body.key)

const up = await uploadWithRetry(tk.body.uploadUrl, tk.body.token, tk.body.key, buf)
console.log('3. 直传七牛 ->', up.status, up.body.slice(0, 90))

const done = await j('/api/profile/avatar/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: tk.body.key }),
})
const avatarUrl = done.body.user?.avatar
console.log('4. complete ->', done.status, avatarUrl)

const prof = await j('/api/profile')
console.log('5. profile.avatar ->', prof.body?.user?.avatar ?? prof.body?.avatar)

const settings = await j('/api/system/settings/all')
console.log('6. settings.app.avatarUrl ->', settings.body?.data?.app?.avatarUrl)

let cdn
try {
  const t0 = Date.now()
  const r = await fetch(avatarUrl, { signal: AbortSignal.timeout(30000) })
  cdn = `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-length')}B ${Date.now() - t0}ms`
} catch (e) {
  cdn = 'ERR ' + e.message
}
console.log('7. CDN 读取 ->', cdn)

if (process.env.KEEP) { console.log('8. KEEP=1，保留头像：' + avatarUrl); process.exit(0) }

const reset = await j('/api/profile/avatar', { method: 'DELETE' })
console.log('8. 删除头像 ->', reset.status, JSON.stringify(reset.body.user?.avatar), '（应为空串）')

const settings2 = await j('/api/system/settings/all')
console.log('9. settings 回退 ->', settings2.body?.data?.app?.avatarUrl)
