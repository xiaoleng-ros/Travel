// 用已在桶里的对象验证「宽高解析 + pfop 缩略图对象」，避免重新上传（本机到 as0 网络抖动大）
import https from 'node:https'
import sharp from 'sharp'
import { probeQiniuImage, generateQiniuThumbnail, qiniuConfig } from '../server/storage.js'

function request(url, { method = 'GET', headers = {}, tries = 12 } = {}) {
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
      req.on('error', (e) => (attempt < tries ? setTimeout(go, 1500) : reject(e)))
      req.end()
    }
    go()
  })
}

async function main() {
  const cfg = qiniuConfig()
  const { default: qiniu } = await import('qiniu')
  const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
  const bm = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())

  const list = await new Promise((resolve, reject) => {
    bm.listPrefix(cfg.bucket, { prefix: 'photos/', limit: 100 }, (err, body, info) =>
      err ? reject(err) : resolve({ body, info }),
    )
  })
  const items = (list.body?.items || []).filter((i) => /\.(jpe?g|png|webp)$/i.test(i.key))
  console.log('桶内可用图片:', items.map((i) => `${i.key} (${i.fsize}B)`).join('\n  ') || '(无)')
  if (!items.length) {
    console.log('没有可测对象，先跑上传')
    return
  }
  const target = items[0]
  console.log('\n使用对象:', target.key)

  const probe = await probeQiniuImage(target.key)
  console.log(`probeQiniuImage → ${probe.width}x${probe.height} size=${probe.fileSize}`)
  console.log(`  thumbnailKey = ${probe.thumbnailKey}`)
  console.log(`  thumbnailUrl = ${probe.thumbnailUrl}`)
  const probeOk = probe.width > 0 && probe.height > 0 && probe.fileSize > 0
  console.log('  宽高/体积解析:', probeOk ? 'OK' : 'FAIL')

  console.log('\n生成缩略图对象…')
  const thumb = await generateQiniuThumbnail(target.key)
  console.log('  persistentId:', thumb.persistentId)

  let got = null
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const r = await request(thumb.thumbnailUrl, { tries: 2 })
      if (r.status === 200 && (r.headers['content-type'] || '').startsWith('image/')) {
        const m = await sharp(r.body).metadata()
        got = { bytes: r.body.length, ct: r.headers['content-type'], w: m.width, h: m.height, fmt: m.format }
        break
      }
    } catch {}
  }
  if (got) {
    console.log(`  缩略图 ${got.ct} ${got.bytes}B → ${got.w}x${got.h} ${got.fmt}`)
  } else {
    console.log('  缩略图在 50s 内未出现')
  }

  // 关键：缩略图与原图是不同对象，绝不互相污染
  const orig = await request(probe.publicUrl, { tries: 4 })
  const th = await request(thumb.thumbnailUrl, { tries: 4 })
  console.log(`\n  原图 ${orig.body.length}B vs 缩略图 ${th.body.length}B → ${orig.body.length !== th.body.length ? 'OK 互不污染' : 'FAIL 相同'}`)

  const ok = probeOk && Boolean(got) && orig.body.length !== th.body.length
  console.log(`\n===== ${ok ? '通过' : '未通过'} =====`)
}

main().catch((e) => {
  console.error('FAILED', e.message)
  process.exit(1)
})
