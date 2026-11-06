// 头像上传耗时探针：分段计时，定位到底是哪一步慢。
// 用法：node --env-file-if-exists=.env scripts/probe-avatar-speed.mjs
import crypto from 'node:crypto'

const API = process.env.API_BASE || 'http://127.0.0.1:3001'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

let cookie = ''
async function call(pathname, { method = 'GET', body } = {}) {
  const started = Date.now()
  const res = await fetch(API + pathname, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const text = await res.text()
  return { status: res.status, ms: Date.now() - started, json: safe(text) }
}
function safe(t) {
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

// 手搓 multipart 直传七牛（curl 在本机 schannel 报错）
function uploadObject(uploadUrl, token, key, buffer) {
  const boundary = '----memora' + crypto.randomBytes(8).toString('hex')
  const parts = []
  for (const [name, value] of [
    ['key', key],
    ['token', token],
  ]) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    )
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.webp"\r\nContent-Type: image/webp\r\n\r\n`,
    ),
  )
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const payload = Buffer.concat(parts)
  const started = Date.now()
  return fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: payload,
  }).then(async (r) => ({
    status: r.status,
    ms: Date.now() - started,
    text: (await r.text()).slice(0, 200),
  }))
}

const login = await call('/api/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
console.log(`login                 ${login.status} ${login.ms}ms`)
if (login.status !== 200) {
  console.error('登录失败，检查 ADMIN_EMAIL / ADMIN_PASSWORD')
  process.exit(1)
}

const mode = await call('/api/profile/avatar/mode')
console.log(`avatar/mode           ${mode.status} ${mode.ms}ms  ${JSON.stringify(mode.json)}`)

if (mode.json?.provider !== 'qiniu') {
  console.log('\n当前是本地模式，上传不走七牛，直接结束。')
  process.exit(0)
}

// 造一张 512×512 的 webp（用 sharp，项目自带）
const sharp = (await import('sharp')).default
const buffer = await sharp({
  create: { width: 512, height: 512, channels: 3, background: { r: 90, g: 140, b: 220 } },
})
  .webp({ quality: 88 })
  .toBuffer()
console.log(`\n本地图片 ${buffer.length} 字节，512×512 webp`)

const tokenRes = await call('/api/profile/avatar/token', {
  method: 'POST',
  body: { filename: 'avatar.webp', mimeType: 'image/webp', size: buffer.length },
})
console.log(`avatar/token          ${tokenRes.status} ${tokenRes.ms}ms  key=${tokenRes.json?.key}`)
if (tokenRes.status !== 200) {
  console.error(JSON.stringify(tokenRes.json))
  process.exit(1)
}

let uploaded = null
for (let i = 1; i <= 6 && !uploaded; i++) {
  try {
    const r = await uploadObject(tokenRes.json.uploadUrl, tokenRes.json.token, tokenRes.json.key, buffer)
    console.log(`  直传七牛 #${i}          ${r.status} ${r.ms}ms`)
    if (r.status === 200) uploaded = r
  } catch (err) {
    // 本机到 upload-as0.qiniup.com 偶发连接超时/重置，重试即可
    console.log(`  直传七牛 #${i}          失败 ${err.cause?.code || err.code || err.message}`)
  }
  if (!uploaded) await new Promise((res) => setTimeout(res, 1500))
}
if (!uploaded) {
  console.error('直传失败，放弃')
  process.exit(1)
}

const done = await call('/api/profile/avatar/complete', {
  method: 'POST',
  body: { key: tokenRes.json.key },
})
console.log(`avatar/complete       ${done.status} ${done.ms}ms  avatar=${done.json?.user?.avatar}`)

const revert = await call('/api/profile/avatar', { method: 'DELETE' })
console.log(`删除头像              ${revert.status} ${revert.ms}ms  avatar=${JSON.stringify(revert.json?.user?.avatar)}`)
const afterSettings = await call('/api/system/settings/all')
console.log(`删除后 settings.app.avatarUrl = ${JSON.stringify(afterSettings.json?.data?.app?.avatarUrl)}`)

console.log('\n结论：上传总耗时 = token + 直传 + complete；complete 现在应该只有几百毫秒。')
