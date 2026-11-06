// 决定性测试：新上传的文件（缓存 Miss）上，query 参数是否被 CDN 忽略
// 本机到 as0 节点 undici/fetch 会莫名 ConnectTimeout，改用 node:https + 重试
import https from 'node:https'
import qiniu from 'qiniu'
import sharp from 'sharp'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const DOMAIN = 'img.iceuu.icu'
const UP_HOST = process.env.T_QINIU_UPLOAD_HOST

const KEY = `photos/__fresh-${Date.now()}.jpg`
const BASE = `https://${DOMAIN}/${KEY}`

function request(url, { method = 'GET', headers = {}, body } = {}, tries = 4) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const go = () => {
      attempt++
      const t0 = Date.now()
      const req = https.request(url, { method, headers, timeout: 25000 }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), ms: Date.now() - t0 }),
        )
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => {
        if (attempt < tries) return setTimeout(go, 600)
        reject(e)
      })
      if (body) req.write(body)
      req.end()
    }
    go()
  })
}

async function show(label, url, opts = {}) {
  const t0 = Date.now()
  try {
    const res = await request(url, opts)
    const buf = res.body
    const ct = res.headers['content-type'] || '-'
    const cache = res.headers['x-qnm-cache'] || '-'
    const clen = res.headers['content-length'] || '-'
    let note = ''
    if (ct.startsWith('image/')) {
      try {
        const m = await sharp(buf).metadata()
        note = `${m.width}x${m.height} ${m.format}`
      } catch {
        note = '(not decodable)'
      }
    } else {
      note = buf.toString('utf8').slice(0, 160).replace(/\s+/g, ' ')
    }
    console.log(
      `${label.padEnd(28)} ${res.status} ${ct.padEnd(18)} ${String(buf.length).padStart(7)}B (hdr ${String(clen).padStart(7)}) cache=${cache.padEnd(5)} ${String(Date.now() - t0).padStart(5)}ms  ${note}`,
    )
  } catch (e) {
    console.log(`${label.padEnd(28)} FAILED ${Date.now() - t0}ms  ${e.code || e.message}`)
  }
}

function multipart(fields, fileField, fileBuf, fileName, mimeType) {
  const boundary = '----memora' + Date.now()
  const parts = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  )
  parts.push(fileBuf)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function main() {
  const buf = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer()

  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const policy = new qiniu.rs.PutPolicy({ scope: `${BUCKET}:${KEY}`, expires: 3600 })
  const { body, contentType } = multipart(
    { token: policy.uploadToken(mac), key: KEY },
    'file',
    buf,
    'fresh.jpg',
    'image/jpeg',
  )
  const up = await request(`${UP_HOST}/`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'Content-Length': body.length },
    body,
  })
  console.log('上传:', up.status, up.body.toString('utf8').slice(0, 200))
  console.log('原图 1200x900', buf.length, 'bytes | KEY:', KEY)
  console.log('')

  // 刚上传，CDN 必然 Miss，参数是否透传到源站一目了然
  await show('① 原始（冷）', BASE)
  await show('② ?imageInfo（冷）', `${BASE}?imageInfo`)
  await show('③ ?imageView2/2/w/300（冷）', `${BASE}?imageView2/2/w/300`)
  await show('④ ?imageMogr2/thumbnail/300x', `${BASE}?imageMogr2/thumbnail/300x`)
  await show('⑤ Range bytes=0-2047', BASE, { headers: { Range: 'bytes=0-2047' } })
  await show('⑥ HEAD', BASE, { method: 'HEAD' })
  await show('⑦ 二次 ?imageInfo（热）', `${BASE}?imageInfo`)

  console.log('\n保留文件供控制台核对:', BASE)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
