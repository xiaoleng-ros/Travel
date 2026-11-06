// 临时探针 v2：用后端真实签发的 uploadToken，对比各上传域名的上传耗时。
// 用法：node --env-file-if-exists=.env scripts/probe-upload-speed.mjs
import https from 'node:https'
import fs from 'node:fs'

const API = process.env.API_BASE || 'http://127.0.0.1:3001'
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const FILE = process.env.PROBE_FILE || 'public/brand/avatar.webp'

function uploadTo(host, ticket, key, buffer) {
  return new Promise((resolve) => {
    const boundary = '----probe' + Math.random().toString(16).slice(2)
    let head = ''
    head += `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${ticket}\r\n`
    head += `--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n`
    head += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.webp"\r\nContent-Type: image/webp\r\n\r\n`
    const body = Buffer.concat([Buffer.from(head), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)])

    const started = Date.now()
    const t0 = process.hrtime.bigint()
    let connectAt = 0
    let tlsAt = 0
    const url = new URL('/upload', host)
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            host: url.host,
            status: res.statusCode,
            ms: Date.now() - started,
            connectMs: Number(connectAt - t0) / 1e6,
            tlsMs: Number(tlsAt - t0) / 1e6,
            body: Buffer.concat(chunks).toString().slice(0, 120).replace(/\s+/g, ' '),
          }),
        )
      },
    )
    req.on('socket', (s) => {
      s.on('connect', () => (connectAt = process.hrtime.bigint()))
      s.on('secureConnect', () => (tlsAt = process.hrtime.bigint()))
    })
    req.on('error', (e) => resolve({ host: url.host, status: 0, ms: Date.now() - started, body: e.message }))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.write(body)
    req.end()
  })
}

async function main() {
  const login = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@memora.local', password: PASSWORD }),
  })
  if (!login.ok) throw new Error(`登录失败 ${login.status} ${await login.text()}`)
  const raw = login.headers.getSetCookie?.() || [login.headers.get('set-cookie')]
  const cookie = raw.filter(Boolean).map((c) => c.split(';')[0]).join('; ')
  const buffer = fs.readFileSync(FILE)
  console.log(`登录 OK，测试文件 ${FILE} ${buffer.length}B`)

  const hosts = (
    process.env.PROBE_HOSTS ||
    'https://upload.qiniup.com,https://upload-z0.qiniup.com,https://upload-z1.qiniup.com,https://upload-z2.qiniup.com,https://upload-as0.qiniup.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const host of hosts) {
    const ticket = await fetch(`${API}/api/profile/avatar/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ mimeType: 'image/webp', size: buffer.length }),
    }).then((r) => r.json())
    if (!ticket.key) {
      console.log(`${host.padEnd(30)} 签发失败 ${JSON.stringify(ticket)}`)
      continue
    }
    const token = ticket.uploadToken || ticket.token || ticket.uptoken || ''
    const r = await uploadTo(host, token, ticket.key, buffer)
    console.log(
      `${r.host.padEnd(30)} status=${String(r.status).padEnd(4)} total=${String(r.ms).padStart(6)}ms connect=${Math.round(r.connectMs || 0)}ms tls=${Math.round(r.tlsMs || 0)}ms ${r.body}`,
    )
  }
}

main().catch((e) => {
  console.error('探针失败:', e.message)
  process.exit(1)
})
