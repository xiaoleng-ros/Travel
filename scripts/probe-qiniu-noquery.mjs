// 验证：纯 JS 宽高解析 + 七牛缩略图持久化对象（不依赖 URL query）
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import sharp from 'sharp'
import { imageSizeFromBuffer } from '../server/image-size.js'
import { generateQiniuThumbnail, probeQiniuImage, deleteQiniuObject, storageKind, qiniuConfig } from '../server/storage.js'

const ROOT = path.resolve(import.meta.dirname, '..')

function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const go = () => {
      attempt++
      const req = https.request(url, { method, headers, timeout: 60000 }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => (attempt < 10 ? setTimeout(go, 1500) : reject(e)))
      req.end()
    }
    go()
  })
}

async function main() {
  console.log('storageKind =', storageKind(), '| domain =', qiniuConfig().domain)

  // ---- 1. 宽高解析自测 ----
  console.log('\n[1] 纯 JS 宽高解析')
  const cases = []
  const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .toBuffer()
  cases.push(['jpeg 1600x1200 (自造)', jpeg, 1600, 1200])
  const png = await sharp({ create: { width: 333, height: 222, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer()
  cases.push(['png 333x222 (自造)', png, 333, 222])
  const webp = await sharp({ create: { width: 480, height: 360, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .webp()
    .toBuffer()
  cases.push(['webp 480x360 (自造)', webp, 480, 360])

  const thumbsDir = path.join(ROOT, 'public', 'seed-thumbs')
  if (fs.existsSync(thumbsDir)) {
    for (const f of fs.readdirSync(thumbsDir).slice(0, 3)) {
      const buf = fs.readFileSync(path.join(thumbsDir, f))
      const meta = await sharp(buf).metadata()
      cases.push([`seed ${f.slice(0, 18)}`, buf, meta.width, meta.height])
    }
  }

  let ok = 0
  for (const [label, buf, w, h] of cases) {
    const got = imageSizeFromBuffer(buf)
    const pass = got && got.width === w && got.height === h
    if (pass) ok++
    console.log(`  ${pass ? 'OK  ' : 'FAIL'} ${label.padEnd(30)} expect ${w}x${h} got ${got ? `${got.width}x${got.height} ${got.format}` : 'null'}`)
  }
  console.log(`  解析通过 ${ok}/${cases.length}`)

  // ---- 2. 七牛端到端：上传 → 解析宽高 → 生成缩略图对象 → 读回 ----
  console.log('\n[2] 七牛端到端（无 query 依赖）')
  const { default: qiniu } = await import('qiniu')
  const cfg = qiniuConfig()
  const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
  const stamp = Date.now()
  const key = `photos/__nq-${stamp}.jpg`

  const policy = new qiniu.rs.PutPolicy({ scope: `${cfg.bucket}:${key}`, expires: 3600 })
  const token = policy.uploadToken(mac)
  const boundary = '----memora' + stamp
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${token}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    jpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]
  const body = Buffer.concat(parts)
  const up = await request(`${cfg.uploadHost}/`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
  })
  console.log('  上传:', up.status, up.body.toString('utf8').slice(0, 80))

  const probe = await probeQiniuImage(key)
  console.log(`  probeQiniuImage → ${probe.width}x${probe.height} size=${probe.fileSize} thumbKey=${probe.thumbnailKey}`)
  const probeOk = probe.width === 1600 && probe.height === 1200 && probe.fileSize > 1000
  console.log('  宽高/体积解析:', probeOk ? 'OK' : 'FAIL')

  const thumb = await generateQiniuThumbnail(key)
  console.log('  pfop persistentId:', thumb.persistentId, '→', thumb.thumbnailKey)

  // 轮询等缩略图对象出现（直接 GET 缩略图 key，不带任何 query）
  let thumbBytes = null
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const r = await request(thumb.thumbnailUrl)
    if (r.status === 200 && (r.headers['content-type'] || '').startsWith('image/')) {
      thumbBytes = r.body
      const m = await sharp(r.body).metadata()
      console.log(`  缩略图 ${r.status} ${r.headers['content-type']} ${r.body.length}B → ${m.width}x${m.height} ${m.format}`)
      break
    }
  }
  const thumbOk = Boolean(thumbBytes)
  console.log('  缩略图对象生成:', thumbOk ? 'OK' : 'FAIL')

  // 决定性对比：同一 key 先请求缩略图，再请求原图，两者必须不同
  const a = await request(thumb.thumbnailUrl)
  const b = await request(probe.publicUrl)
  console.log(`  缩略图 vs 原图字节: ${a.body.length} vs ${b.body.length} → ${a.body.length !== b.body.length ? 'OK（互不污染）' : 'FAIL'}`)

  await deleteQiniuObject(key)
  await deleteQiniuObject(thumb.thumbnailKey)
  console.log('\n  清理完成')

  const allOk = ok === cases.length && probeOk && thumbOk
  console.log(`\n===== ${allOk ? '全部通过' : '有失败项'} =====`)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('FAILED', e)
  process.exit(1)
})
