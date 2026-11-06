// 决定性测试：对一个全新 key，第一次请求就直接带 fop 参数。
// - 若返回 JSON/缩放图 → CDN 会转发 query，只是缓存键忽略 query（首次命中即污染）
// - 若仍返回原图 → CDN 直接把 query 丢掉，从不转发
import https from 'node:https'
import crypto from 'node:crypto'
import qiniu from 'qiniu'
import sharp from 'sharp'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const DOMAIN = 'img.iceuu.icu'
const UP_HOST = process.env.T_QINIU_UPLOAD_HOST

function request(url, { method = 'GET', headers = {}, body } = {}) {
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
      req.on('error', (e) => (attempt < 4 ? setTimeout(go, 700) : reject(e)))
      if (body) req.write(body)
      req.end()
    }
    go()
  })
}

function multipart(fields, fileBuf, fileName, mimeType) {
  const boundary = '----memora' + Date.now()
  const parts = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  )
  parts.push(fileBuf)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function upload(buf, key) {
  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const policy = new qiniu.rs.PutPolicy({ scope: `${BUCKET}:${key}`, expires: 3600 })
  const { body, contentType } = multipart({ token: policy.uploadToken(mac), key }, buf, 'x.jpg', 'image/jpeg')
  const r = await request(`${UP_HOST}/`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'Content-Length': body.length },
    body,
  })
  return r.status
}

async function describe(label, url) {
  try {
    const r = await request(url)
    const ct = r.headers['content-type'] || '-'
    let note = ''
    if (ct.startsWith('image/')) {
      try {
        const m = await sharp(r.body).metadata()
        note = `${m.width}x${m.height} ${m.format}`
      } catch {
        note = '(undecodable)'
      }
    } else {
      note = r.body.toString('utf8').slice(0, 120).replace(/\s+/g, ' ')
    }
    console.log(
      `${label.padEnd(34)} ${r.status} ${ct.padEnd(17)} ${String(r.body.length).padStart(6)}B cache=${(r.headers['x-qnm-cache'] || '-').padEnd(5)} ${note}`,
    )
  } catch (e) {
    console.log(`${label.padEnd(34)} FAILED ${e.code || e.message}`)
  }
}

async function main() {
  const make = (r, g, b) =>
    sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r, g, b } } })
      .jpeg({ quality: 85 })
      .toBuffer()

  const stamp = Date.now()
  const kA = `photos/__firstinfo-${stamp}.jpg`
  const kB = `photos/__firstview-${stamp}.jpg`
  const bufA = await make(200, 40, 40)
  const bufB = await make(40, 40, 200)

  console.log('上传 A（第一次请求将带 ?imageInfo）:', await upload(bufA, kA), kA)
  console.log('上传 B（第一次请求将带 ?imageView2/2/w/300）:', await upload(bufB, kB), kB)
  console.log('')

  // 关键：这两个 key 从没被无参数访问过，缓存里只有刚 PUT 的对象本身
  await describe('A 第一次 ?imageInfo', `https://${DOMAIN}/${kA}?imageInfo`)
  await describe('B 第一次 ?imageView2/2/w/300', `https://${DOMAIN}/${kB}?imageView2/2/w/300`)
  await describe('A 第二次 ?imageInfo', `https://${DOMAIN}/${kA}?imageInfo`)
  await describe('B 第二次 ?imageView2/2/w/300', `https://${DOMAIN}/${kB}?imageView2/2/w/300`)

  console.log('\n对比：attname 是否生效（说明 query 至少被读到）')
  await describe('A ?attname=zzz.txt', `https://${DOMAIN}/${kA}?attname=zzz.txt`)

  console.log('\n清理这两个测试对象…')
  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const bm = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())
  for (const k of [kA, kB]) {
    await new Promise((r) => bm.delete(BUCKET, k, () => r()))
  }
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
